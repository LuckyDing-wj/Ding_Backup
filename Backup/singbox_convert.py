#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
singbox_convert.py — 将 alive.txt (明文分享链接) 转为 sing-box 配置

用法:
  python singbox_convert.py [--in alive.txt] [--out singbox.json] [--port 7890]
"""

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from node_tester import parse_uri_line  # noqa: E402

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def tls_block(p):
    """clash tls 字段 -> sing-box tls 对象"""
    tls = {"enabled": True}
    sni = p.get("servername") or p.get("sni")
    if sni:
        tls["server_name"] = sni
    if p.get("skip-cert-verify"):
        tls["insecure"] = True
    if p.get("client-fingerprint"):
        tls["utls"] = {"enabled": True, "fingerprint": p["client-fingerprint"]}
    ro = p.get("reality-opts")
    if ro:
        tls["reality"] = {
            "enabled": True,
            "public_key": ro.get("public-key", ""),
        }
        if ro.get("short-id"):
            tls["reality"]["short_id"] = str(ro["short-id"])
    return tls


def transport_block(p):
    net = p.get("network")
    if net == "ws":
        w = p.get("ws-opts") or {}
        t = {"type": "ws", "path": w.get("path", "/")}
        host = (w.get("headers") or {}).get("Host")
        if host:
            t["headers"] = {"Host": host}
        return t
    if net == "grpc":
        g = p.get("grpc-opts") or {}
        return {"type": "grpc", "service_name": g.get("grpc-service-name", "")}
    return None


def clash_to_singbox(p):
    t = p.get("type")
    base = {"tag": p.get("name") or f'{p.get("server")}:{p.get("port")}',
            "server": p.get("server"), "server_port": int(p.get("port", 0))}
    try:
        if t == "vmess":
            out = {**base, "type": "vmess", "uuid": p.get("uuid", ""),
                   "security": p.get("cipher", "auto"),
                   "alter_id": int(p.get("alterId", 0) or 0)}
        elif t == "vless":
            out = {**base, "type": "vless", "uuid": p.get("uuid", ""),
                   "packet_encoding": "xudp"}
            if p.get("flow"):
                out["flow"] = p["flow"]
        elif t == "ss":
            out = {**base, "type": "shadowsocks",
                   "method": p.get("cipher", ""), "password": p.get("password", "")}
        elif t == "trojan":
            out = {**base, "type": "trojan", "password": p.get("password", "")}
        elif t == "hysteria2":
            out = {**base, "type": "hysteria2", "password": p.get("password", "")}
        else:
            return None
    except (TypeError, ValueError):
        return None

    if t in ("vmess", "vless", "trojan", "hysteria2"):
        out["tls"] = tls_block(p)
    if t in ("vmess", "vless", "trojan"):
        tr = transport_block(p)
        if tr:
            out["transport"] = tr
    # 清理未启用 TLS 的空块
    if "tls" in out and not out["tls"].get("enabled"):
        del out["tls"]
    if "tls" in out and out["tls"].get("enabled"):
        out["tls"] = {k: v for k, v in out["tls"].items() if v not in (None, {}, [])}
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="infile", default=os.path.join(BASE_DIR, "alive.txt"))
    ap.add_argument("--out", dest="outfile", default=os.path.join(BASE_DIR, "singbox.json"))
    ap.add_argument("--port", type=int, default=7890, help="本地混合代理端口")
    args = ap.parse_args()

    nodes, used = [], set()
    for line in open(args.infile, encoding="utf-8"):
        line = line.strip()
        if not line:
            continue
        p = parse_uri_line(line)
        if not p:
            print(f"  跳过不支持的节点: {line[:60]}")
            continue
        out = clash_to_singbox(p)
        if not out:
            print(f"  转换失败: {p.get('name', '?')}")
            continue
        tag, n = out["tag"], 2
        while tag in used:
            tag = f"{out['tag']}#{n}"
            n += 1
        used.add(tag)
        out["tag"] = tag
        nodes.append(out)

    if not nodes:
        print("无节点")
        return

    tags = [o["tag"] for o in nodes]
    cfg = {
        "log": {"level": "warn", "timestamp": True},
        "inbounds": [{
            "type": "mixed", "tag": "mixed-in",
            "listen": "127.0.0.1", "listen_port": args.port,
        }],
        "outbounds": [
            {
                "type": "selector", "tag": "Proxy",
                "outbounds": ["Auto"] + tags,
                "default": "Auto",
                "interrupt_exist_connections": False,
            },
            {
                "type": "urltest", "tag": "Auto",
                "outbounds": tags,
                "url": "https://www.gstatic.com/generate_204",
                "interval": "10m",
                "tolerance": 50,
            },
            *nodes,
            {"type": "direct", "tag": "direct"},
        ],
        "route": {"auto_detect_interface": True, "final": "Proxy"},
    }

    with open(args.outfile, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
    print(f"已写入 {args.outfile} ({len(nodes)} 个出站, "
          f"入口 127.0.0.1:{args.port})")


if __name__ == "__main__":
    main()
