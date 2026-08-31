#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
node_tester.py — 免费节点拉取、合并、延迟测试、导出可用节点

流程:
  1. 读取 links.txt 中全部订阅链接并下载
  2. 解析为 Clash 格式 (yaml 订阅 / 明文分享链接 / base64 订阅), 去重
  3. 生成 config.yaml, 启动 mihomo 内核 (自动下载, 缓存在 mihomo_work/)
  4. 通过 RESTful API 批量测延迟
  5. 输出可用节点为明文分享链接 (alive.txt)

用法:
  python node_tester.py [--links links.txt] [--out alive.txt]
                        [--limit N] [--timeout 5000] [--delay-max 10000]
"""

import argparse
import base64
import faulthandler
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.parse
import urllib.request
import zipfile
from concurrent.futures import ThreadPoolExecutor

try:
    import yaml
except ImportError:
    print("缺少 PyYAML: pip install pyyaml")
    sys.exit(1)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WORK_DIR = os.path.join(BASE_DIR, "mihomo_work")
GH_PROXY = "https://gh-proxy.com/"
API_PORT = 9099
API_BASE = f"http://127.0.0.1:{API_PORT}"

SS_CIPHERS = {
    "aes-128-gcm", "aes-192-gcm", "aes-256-gcm",
    "aes-128-cfb", "aes-192-cfb", "aes-256-cfb",
    "aes-128-ctr", "aes-192-ctr", "aes-256-ctr",
    "rc4-md5", "chacha20", "chacha20-ietf",
    "chacha20-ietf-poly1305", "xchacha20", "xchacha20-ietf",
    "xchacha20-ietf-poly1305",
    "2022-blake3-aes-128-gcm", "2022-blake3-aes-256-gcm",
    "2022-blake3-chacha20-poly1305", "none", "plain",
}

UA = ("clash.meta/v1.19.0")


# ---------------------------------------------------------------- 下载

def http_get(url, timeout=40):
    # 本机 urllib 偶发挂死, curl 经验证可靠, 统一走 curl
    r = subprocess.run(
        ["curl.exe", "-sL", "--max-time", str(timeout), "-A", UA, url],
        capture_output=True, timeout=timeout + 15)
    if r.returncode != 0:
        raise RuntimeError(f"curl exit {r.returncode}")
    if not r.stdout:
        raise RuntimeError("empty body")
    return r.stdout


def fetch_all(links):
    def one(i_url):
        i, url = i_url
        for attempt in (1, 2):
            try:
                text = http_get(url, timeout=60).decode("utf-8", "replace")
                print(f"[{i}/{len(links)}] OK   {len(text):>8}B  {url[:80]}")
                return text
            except Exception as e:
                if attempt == 2:
                    print(f"[{i}/{len(links)}] FAIL {url[:80]}  ({e})")
        return None

    with ThreadPoolExecutor(max_workers=6) as ex:
        results = list(ex.map(one, enumerate(links, 1)))
    return [r for r in results if r is not None]


# ---------------------------------------------------------------- base64

def b64decode_flexible(data):
    data = data.strip().replace("-", "+").replace("_", "/")
    pad = (-len(data)) % 4
    return base64.b64decode(data + "=" * pad).decode("utf-8", "replace")


# ---------------------------------------------------------------- URI -> clash

def _ws_opts(query):
    opts = {}
    path = query.get("path", ["/"])[0]
    host = query.get("host", [None])[0]
    if path:
        opts["path"] = path
    if host:
        opts["headers"] = {"Host": host}
    return opts or None


def uri_to_vmess(raw, src):
    j = json.loads(b64decode_flexible(raw))
    p = {
        "name": j.get("ps") or f'{j.get("add")}:{j.get("port")}',
        "type": "vmess",
        "server": j.get("add"),
        "port": int(j.get("port", 443)),
        "uuid": j.get("id"),
        "alterId": int(j.get("aid", 0) or 0),
        "cipher": j.get("scy") or "auto",
        "udp": True,
        "_src": src,
    }
    net = j.get("net") or "tcp"
    if net in ("ws", "grpc", "h2"):
        p["network"] = net
    if net == "ws":
        w = _ws_opts({"path": [j.get("path", "/")], "host": [j.get("host")] if j.get("host") else []})
        if w:
            p["ws-opts"] = w
    if net == "grpc" and j.get("path"):
        p["grpc-opts"] = {"grpc-service-name": j["path"]}
    if j.get("tls") == "tls":
        p["tls"] = True
        sni = j.get("sni") or j.get("host")
        if sni:
            p["servername"] = sni
    return p


def uri_to_vless(url, src):
    q = urllib.parse.parse_qs(url.query)
    frag = urllib.parse.unquote(url.fragment) if url.fragment else None
    p = {
        "name": frag or f"{url.hostname}:{url.port}",
        "type": "vless",
        "server": url.hostname,
        "port": url.port or 443,
        "uuid": url.username,
        "cipher": "none",
        "udp": True,
        "_src": src,
    }
    if q.get("flow"):
        p["flow"] = q["flow"][0]
    sec = q.get("security", ["none"])[0]
    if sec in ("tls", "reality"):
        p["tls"] = True
        sni = q.get("sni", [None])[0]
        if sni:
            p["servername"] = sni
    if sec == "reality":
        ro = {}
        if q.get("pbk"):
            ro["public-key"] = q["pbk"][0]
        if q.get("sid"):
            ro["short-id"] = q["sid"][0]
        if ro:
            p["reality-opts"] = ro
    if q.get("fp"):
        p["client-fingerprint"] = q["fp"][0]
    net = q.get("type", ["tcp"])[0]
    if net in ("ws", "grpc", "h2"):
        p["network"] = net
    if net == "ws":
        w = _ws_opts(q)
        if w:
            p["ws-opts"] = w
    if net == "grpc" and q.get("serviceName"):
        p["grpc-opts"] = {"grpc-service-name": q["serviceName"][0]}
    return p


def uri_to_ss(url, src):
    frag = urllib.parse.unquote(url.fragment) if url.fragment else None
    host, port, method, password = url.hostname, url.port, None, None
    userinfo = url.netloc.rsplit("@", 1)[0] if "@" in url.netloc else None
    if userinfo:
        try:
            dec = b64decode_flexible(userinfo)
        except Exception:
            dec = urllib.parse.unquote(userinfo)
        method, _, password = dec.partition(":")
    else:
        dec = b64decode_flexible(url.netloc)
        userinfo_part, _, hostport = dec.rpartition("@")
        method, _, password = userinfo_part.partition(":")
        host, _, port = hostport.partition(":")
        port = int(port)
    return {
        "name": frag or f"{host}:{port}",
        "type": "ss",
        "server": host,
        "port": port,
        "cipher": method,
        "password": password,
        "udp": True,
        "_src": src,
    }


def uri_to_trojan(url, src):
    q = urllib.parse.parse_qs(url.query)
    frag = urllib.parse.unquote(url.fragment) if url.fragment else None
    p = {
        "name": frag or f"{url.hostname}:{url.port}",
        "type": "trojan",
        "server": url.hostname,
        "port": url.port or 443,
        "password": urllib.parse.unquote(url.username or ""),
        "udp": True,
        "skip-cert-verify": q.get("allowInsecure", ["0"])[0] == "1",
        "_src": src,
    }
    sni = q.get("sni", [None])[0]
    if sni:
        p["sni"] = sni
    net = q.get("type", ["tcp"])[0]
    if net == "ws":
        p["network"] = "ws"
        w = _ws_opts(q)
        if w:
            p["ws-opts"] = w
    return p


def uri_to_hysteria2(url, src):
    q = urllib.parse.parse_qs(url.query)
    frag = urllib.parse.unquote(url.fragment) if url.fragment else None
    p = {
        "name": frag or f"{url.hostname}:{url.port}",
        "type": "hysteria2",
        "server": url.hostname,
        "port": url.port or 443,
        "password": urllib.parse.unquote(url.username or ""),
        "_src": src,
    }
    sni = q.get("sni", [None])[0]
    if sni:
        p["sni"] = sni
    if q.get("insecure", ["0"])[0] == "1":
        p["skip-cert-verify"] = True
    return p


def parse_uri_line(line):
    low = line.lower()
    try:
        if low.startswith("vmess://"):
            return uri_to_vmess(line[8:], line)
        if low.startswith("vless://"):
            return uri_to_vless(urllib.parse.urlsplit(line), line)
        if low.startswith("ss://"):
            return uri_to_ss(urllib.parse.urlsplit(line), line)
        if low.startswith("trojan://"):
            return uri_to_trojan(urllib.parse.urlsplit(line), line)
        if low.startswith(("hysteria2://", "hy2://")):
            return uri_to_hysteria2(urllib.parse.urlsplit(line), line)
    except Exception:
        return None
    return None


# ---------------------------------------------------------------- clash -> URI (yaml 源回写)

def proxy_to_uri(p):
    t = p.get("type")
    try:
        if t == "vmess":
            j = {
                "v": "2", "ps": p.get("name", ""), "add": p["server"],
                "port": str(p["port"]), "id": p.get("uuid", ""),
                "aid": str(p.get("alterId", 0)), "net": p.get("network", "tcp"),
                "type": "none", "host": "", "path": "", "tls": "tls" if p.get("tls") else "",
            }
            if p.get("servername"):
                j["sni"] = p["servername"]
            if p.get("ws-opts"):
                j["path"] = p["ws-opts"].get("path", "/")
                j["host"] = p["ws-opts"].get("headers", {}).get("Host", "")
            if p.get("grpc-opts"):
                j["path"] = p["grpc-opts"].get("grpc-service-name", "")
            return "vmess://" + base64.b64encode(
                json.dumps(j, ensure_ascii=False).encode()).decode()
        if t == "vless":
            q = {"encryption": "none"}
            if p.get("flow"):
                q["flow"] = p["flow"]
            q["security"] = "reality" if p.get("reality-opts") else ("tls" if p.get("tls") else "none")
            if p.get("servername"):
                q["sni"] = p["servername"]
            if p.get("client-fingerprint"):
                q["fp"] = p["client-fingerprint"]
            ro = p.get("reality-opts") or {}
            if ro.get("public-key"):
                q["pbk"] = ro["public-key"]
            if ro.get("short-id"):
                q["sid"] = ro["short-id"]
            net = p.get("network", "tcp")
            q["type"] = net
            if net == "ws" and p.get("ws-opts"):
                q["path"] = p["ws-opts"].get("path", "/")
                h = p["ws-opts"].get("headers", {}).get("Host")
                if h:
                    q["host"] = h
            if net == "grpc" and p.get("grpc-opts"):
                q["serviceName"] = p["grpc-opts"].get("grpc-service-name", "")
            query = urllib.parse.urlencode(q)
            return (f'vless://{p.get("uuid", "")}@{p["server"]}:{p["port"]}'
                    f"?{query}#{urllib.parse.quote(p.get('name', ''))}")
        if t == "ss":
            userinfo = base64.urlsafe_b64encode(
                f'{p["cipher"]}:{p["password"]}'.encode()).decode().rstrip("=")
            return (f'ss://{userinfo}@{p["server"]}:{p["port"]}'
                    f'#{urllib.parse.quote(p.get("name", ""))}')
        if t == "trojan":
            q = {}
            if p.get("sni"):
                q["sni"] = p["sni"]
            query = ("?" + urllib.parse.urlencode(q)) if q else ""
            return (f'trojan://{urllib.parse.quote(p.get("password", ""))}'
                    f'@{p["server"]}:{p["port"]}{query}'
                    f'#{urllib.parse.quote(p.get("name", ""))}')
        if t == "hysteria2":
            q = {}
            if p.get("sni"):
                q["sni"] = p["sni"]
            if p.get("skip-cert-verify"):
                q["insecure"] = "1"
            query = ("?" + urllib.parse.urlencode(q)) if q else ""
            return (f'hysteria2://{urllib.parse.quote(p.get("password", ""))}'
                    f'@{p["server"]}:{p["port"]}{query}'
                    f'#{urllib.parse.quote(p.get("name", ""))}')
    except Exception:
        return None
    return None


# ---------------------------------------------------------------- 解析订阅内容

def node_key(p):
    ident = p.get("uuid") or p.get("password") or ""
    return (p.get("type"), p.get("server"), p.get("port"), str(ident))


def parse_content(text, proxies, seen_keys):
    text = text.strip()
    batch = []

    # 1) Clash yaml
    if text.startswith("{") or "\nproxies:" in text or text.startswith("proxies:"):
        try:
            data = yaml.safe_load(text)
            if isinstance(data, dict) and isinstance(data.get("proxies"), list):
                batch = [p for p in data["proxies"] if isinstance(p, dict) and p.get("server")]
        except Exception:
            pass

    # 2) 明文分享链接
    if not batch:
        uris = [l.strip() for l in text.splitlines()
                if re.match(r"^(vmess|vless|ss|ssr|trojan|hysteria2?|hy2)://", l.strip(), re.I)]
        if not uris:
            # 3) base64 订阅
            try:
                dec = b64decode_flexible(text)
                uris = [l.strip() for l in dec.splitlines()
                        if re.match(r"^(vmess|vless|ss|ssr|trojan|hysteria2?|hy2)://", l.strip(), re.I)]
            except Exception:
                uris = []
        for u in uris:
            p = parse_uri_line(u)
            if p:
                batch.append(p)

    for p in batch:
        k = node_key(p)
        if k not in seen_keys:
            seen_keys.add(k)
            proxies.append(p)


def drop_invalid_ss(proxies):
    bad = [p for p in proxies
           if p.get("type") == "ss" and p.get("cipher") not in SS_CIPHERS]
    if bad:
        for p in bad:
            proxies.remove(p)
        print(f"剔除 {len(bad)} 个无效 cipher 的 ss 节点")

    # REALITY 参数预校验: short-id 须为偶数长度 hex, 必须有 public-key
    bad2 = [p for p in proxies
            if p.get("reality-opts") and (
                not p["reality-opts"].get("public-key")
                or not re.fullmatch(
                    r"([0-9a-fA-F]{2})*",
                    str(p["reality-opts"].get("short-id", "")).strip()))]
    if bad2:
        for p in bad2:
            proxies.remove(p)
        print(f"剔除 {len(bad2)} 个无效 REALITY 参数的节点")


# ---------------------------------------------------------------- mihomo

MIHOMO_CANDIDATES = [
    r"C:\Program Files\Sparkle\resources\sidecar\mihomo.exe",
    r"C:\Program Files\Sparkle\resources\sidecar\mihomo-alpha.exe",
    r"C:\Program Files\Clash Verge\resources\sidecar\verge-mihomo.exe",
    r"C:\Program Files\Clash Nyanpasu\resources\sidecar\clash-meta.exe",
]


def ensure_mihomo():
    for c in MIHOMO_CANDIDATES:
        if os.path.exists(c):
            print(f"使用本地内核: {c}")
            return c
    which = shutil.which("mihomo")
    if which:
        return which
    exe = os.path.join(WORK_DIR, "mihomo.exe")
    if os.path.exists(exe):
        return exe
    os.makedirs(WORK_DIR, exist_ok=True)
    print("下载 mihomo 内核...")
    rel = json.loads(http_get(
        "https://api.github.com/repos/MetaCubeX/mihomo/releases/latest").decode())
    tag = rel["tag_name"]
    asset = next(a for a in rel["assets"]
                 if a["name"] == f"mihomo-windows-amd64-{tag}.zip")
    zip_path = os.path.join(WORK_DIR, "mihomo.zip")
    with open(zip_path, "wb") as f:
        f.write(http_get(GH_PROXY + asset["browser_download_url"], timeout=300))
    with zipfile.ZipFile(zip_path) as z:
        for n in z.namelist():
            if n.endswith(".exe"):
                with z.open(n) as src, open(exe, "wb") as dst:
                    shutil.copyfileobj(src, dst)
                break
    os.remove(zip_path)
    print(f"mihomo {tag} 就绪")
    return exe


def write_config(proxies, test_url):
    names = [p["name"] for p in proxies]
    cfg = {
        "mixed-port": 7891,
        "external-controller": f"127.0.0.1:{API_PORT}",
        "mode": "rule",
        "log-level": "warning",
        "proxies": [{k: v for k, v in p.items() if k != "_src"} for p in proxies],
        "proxy-groups": [{"name": "TEST", "type": "select", "proxies": names}],
        "rules": ["MATCH,DIRECT"],
    }
    with open(os.path.join(WORK_DIR, "config.yaml"), "w", encoding="utf-8") as f:
        yaml.safe_dump(cfg, f, allow_unicode=True, sort_keys=False)


def api_get(path, timeout=30):
    req = urllib.request.Request(API_BASE + path, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def start_mihomo(exe, proxies, test_url):
    cfg = os.path.join(WORK_DIR, "config.yaml")

    # 逐轮校验, 自动剔除导致配置非法的坏节点
    for _ in range(100):
        write_config(proxies, test_url)
        r = subprocess.run(
            [exe, "-t", "-d", WORK_DIR, "-f", cfg],
            capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW)
        if r.returncode == 0:
            break
        out = (r.stdout + r.stderr).decode("utf-8", "replace")
        idx = None
        # mihomo 初始化错误格式: "proxy <下标>: <原因>"
        m = re.search(r"proxy (\d+): ", out)
        if m and int(m.group(1)) < len(proxies):
            idx = int(m.group(1))
        if idx is None:
            for i, p in enumerate(proxies):
                if f"proxy {p['name']}:" in out:
                    idx = i
                    break
        if idx is None:
            for i, p in enumerate(proxies):
                if (str(p.get("server")) + ":" + str(p.get("port"))) in out:
                    idx = i
                    break
        if idx is None:
            raise RuntimeError("配置校验失败且无法定位坏节点:\n" + out[-2000:])
        print(f"剔除无效节点: {proxies[idx]['name']}")
        proxies.pop(idx)

    proc = subprocess.Popen(
        [exe, "-d", WORK_DIR, "-f", cfg],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        creationflags=subprocess.CREATE_NO_WINDOW)
    for _ in range(30):
        time.sleep(1)
        try:
            api_get("/version", timeout=3)
            return proc
        except Exception:
            pass
    raise RuntimeError("mihomo API 未就绪")


def test_delay_all(test_url, timeout_ms, workers=32):
    # 优先用 group 批量接口
    try:
        r = api_get(f"/group/TEST/delay?url={urllib.parse.quote(test_url)}"
                    f"&timeout={timeout_ms}", timeout=max(120, timeout_ms // 5))
        return {k: v for k, v in r.items() if isinstance(v, int) and v > 0}
    except Exception as e:
        print(f"group 批量接口失败({e}), 改为逐节点测试")
        names = api_get("/proxies")["proxies"]["TEST"]["all"]
        result = {}

        def one(name):
            try:
                r = api_get(f"/proxies/{urllib.parse.quote(name, safe='')}"
                            f"/delay?url={urllib.parse.quote(test_url)}"
                            f"&timeout={timeout_ms}", timeout=timeout_ms // 500 + 10)
                d = r.get("delay")
                if isinstance(d, int) and d > 0:
                    result[name] = d
            except Exception:
                pass

        done = 0
        with ThreadPoolExecutor(max_workers=workers) as ex:
            for _ in ex.map(one, names):
                done += 1
                if done % 200 == 0:
                    print(f"  已测 {done}/{len(names)}")
        return result


# ---------------------------------------------------------------- main

def main():
    faulthandler.dump_traceback_later(7200, exit=True)
    ap = argparse.ArgumentParser()
    ap.add_argument("--links", default=os.path.join(BASE_DIR, "links.txt"))
    ap.add_argument("--out", default=os.path.join(BASE_DIR, "alive.txt"))
    ap.add_argument("--from-config", dest="from_config", default=None,
                    help="跳过测试, 将已有 clash 配置的节点导出为分享链接")
    ap.add_argument("--limit", type=int, default=0, help="最多测试多少节点, 0=全部")
    ap.add_argument("--sample", type=int, default=0, help="随机抽样测试 N 个, 0=不抽样")
    ap.add_argument("--workers", type=int, default=32, help="逐节点测试并发数")
    ap.add_argument("--timeout", type=int, default=5000, help="单节点超时 ms")
    ap.add_argument("--url", default="https://www.gstatic.com/generate_204",
                    help="延迟测试 URL")
    args = ap.parse_args()

    if args.from_config:
        data = yaml.safe_load(open(args.from_config, encoding="utf-8"))
        proxies = [p for p in (data or {}).get("proxies", [])
                   if isinstance(p, dict) and p.get("server")]
        uris, skipped = [], 0
        for p in proxies:
            u = proxy_to_uri(p)
            if u:
                uris.append(u)
            else:
                skipped += 1
        with open(args.out, "w", encoding="utf-8") as f:
            f.write("\n".join(uris) + "\n")
        print(f"共 {len(proxies)} 个节点, 导出 {len(uris)}, "
              f"跳过 {skipped} 个不支持转换的类型 -> {args.out}")
        return

    links = [l.strip() for l in open(args.links, encoding="utf-8") if l.strip()]
    print(f"共 {len(links)} 个订阅链接")

    contents = fetch_all(links)
    proxies, seen = [], set()
    print(f"开始解析 {len(contents)} 个内容...")
    for i, c in enumerate(contents, 1):
        parse_content(c, proxies, seen)
        print(f"  解析 {i}/{len(contents)} 完成, 累计 {len(proxies)} 节点")
    print(f"解析到 {len(proxies)} 个去重节点")
    drop_invalid_ss(proxies)

    if not proxies:
        print("无节点, 退出")
        return

    # 命名去重
    used = set()
    for i, p in enumerate(proxies):
        name = re.sub(r"[\r\n|,]", "", str(p.get("name") or "")) or f'{p["server"]}:{p["port"]}'
        base, n = name, 2
        while name in used:
            name = f"{base}#{n}"
            n += 1
        used.add(name)
        p["name"] = name

    if args.sample > 0 and len(proxies) > args.sample:
        import random
        random.shuffle(proxies)
        print(f"随机抽样 {args.sample}/{len(proxies)} 个测试")
        proxies = proxies[:args.sample]

    if args.limit > 0 and len(proxies) > args.limit:
        print(f"按 --limit 截取前 {args.limit} 个")
        proxies = proxies[:args.limit]

    os.makedirs(WORK_DIR, exist_ok=True)
    exe = ensure_mihomo()
    proc = None

    try:
        print("启动 mihomo...")
        proc = start_mihomo(exe, proxies, args.url)
        print(f"开始测延迟 (timeout={args.timeout}ms, url={args.url}) ...")
        t0 = time.time()
        alive = test_delay_all(args.url, args.timeout, args.workers)
        print(f"测试完成, 用时 {time.time() - t0:.0f}s, "
              f"可用 {len(alive)}/{len(proxies)}")
    finally:
        if proc:
            proc.terminate()

    if alive:
        uris, seen_src, lost = [], set(), 0
        for p in proxies:
            if p["name"] not in alive:
                continue
            u = p.get("_src") or proxy_to_uri(p)
            if not u:
                lost += 1
                print(f"  无法转换为分享链接, 已跳过: [{p['type']}] {p['name']}")
                continue
            if u in seen_src:
                continue
            seen_src.add(u)
            uris.append(u)
        with open(args.out, "w", encoding="utf-8") as f:
            f.write("\n".join(uris) + "\n")

        delays = sorted(alive.values())
        print(f"已写入 {args.out} ({len(uris)} 个节点)")
        print(f"延迟分布: min={delays[0]}ms 中位={delays[len(delays)//2]}ms max={delays[-1]}ms")
    else:
        print("无可用节点")


if __name__ == "__main__":
    main()
