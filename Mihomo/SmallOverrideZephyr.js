/***
 * Zephyr Override - 基于 YaNet 优化脚本转写
 * 原作者: dahaha-365 (YaNet)
 * 转写为 Zephyr Override System 兼容格式
 *
 * 与原版的主要差异:
 *   - 使用 log.info/warn/error 替代 console.log
 *   - 使用 config.get()/config.set() API
 *   - 使用 env.platform / env.profileName 环境 API
 *   - QuickJS 兼容 (var 优先)
 */

function stringToArray(val) {
  if (Array.isArray(val)) return val;
  if (typeof val !== "string") return [];
  return val
    .split(";")
    .map(function (item) { return item.trim(); })
    .filter(function (item) { return item.length > 0; });
}

// --- 1. 静态配置区域 ---

var _skipIps =
  "10.0.0.0/8;100.64.0.0/10;127.0.0.0/8;169.254.0.0/16;172.16.0.0/12;192.168.0.0/16;198.18.0.0/16;FC00::/7;FE80::/10;::1/128";

var _chinaDohDns =
  "https://doh.pub/dns-query;https://dns.alidns.com/dns-query";
var _foreignDohDns =
  "https://dns.google/dns-query;https://dns.adguard-dns.com/dns-query";
var _chinaIpDns = "119.29.29.29;223.5.5.5";
var _foreignIpDns = "8.8.8.8;94.140.14.14";

var args = {
  enable: true,
  ruleSet: "ads",
  regionSet: "none",
  excludeHighPercentage: true,
  globalRatioLimit: 2,
  skipIps: _skipIps,
  defaultDNS: _chinaIpDns,
  directDNS: _chinaIpDns,
  chinaDNS: _chinaDohDns,
  foreignDNS: _foreignDohDns,
  mode: "",
  ipv6: false,
  logLevel: "error",
  githubProxy: "https://ghfast.top/",
};

var enable = args.enable;
var ruleSet = args.ruleSet || "openai;youtube;ads";
var regionSet = args.regionSet || "all";
var excludeHighPercentage = args.excludeHighPercentage;
var globalRatioLimit = args.globalRatioLimit || 2;
var skipIps = args.skipIps || _skipIps;
var defaultDNS = args.defaultDNS || _chinaIpDns;
var directDNS = args.directDNS || _chinaIpDns;
var chinaDNS = args.chinaDNS || _chinaDohDns;
var foreignDNS = args.foreignDNS || _foreignDohDns;
var mode = args.mode || "";
var ipv6 = args.ipv6;
var logLevel = args.logLevel || "error";
var githubProxy = args.githubProxy || "https://ghfast.top/";

// 模式配置
if (["securest", "secure", "default", "fast", "fastest"].indexOf(mode) !== -1) {
  if (mode === "securest") {
    defaultDNS = _foreignIpDns;
    directDNS = _foreignDohDns;
  } else if (mode === "secure") {
    defaultDNS = _foreignIpDns;
    directDNS = _chinaDohDns;
    chinaDNS = _chinaDohDns;
    foreignDNS = _foreignDohDns;
  } else if (mode === "fast") {
    defaultDNS = _chinaIpDns;
    directDNS = _chinaIpDns;
    chinaDNS = _chinaIpDns;
    foreignDNS = _chinaDohDns;
  } else if (mode === "fastest") {
    defaultDNS = _chinaIpDns;
    directDNS = _chinaIpDns;
    chinaDNS = _chinaIpDns;
    foreignDNS = _chinaIpDns;
  } else {
    defaultDNS = _chinaIpDns;
    directDNS = _chinaIpDns;
    chinaDNS = _chinaDohDns;
    foreignDNS = _chinaDohDns;
  }
}

skipIps = stringToArray(skipIps);
defaultDNS = stringToArray(defaultDNS);
directDNS = stringToArray(directDNS);
chinaDNS = stringToArray(chinaDNS);
foreignDNS = stringToArray(foreignDNS);

// --- 分流规则开关 ---

var ruleOptions = {
  apple: false,
  microsoft: false,
  github: false,
  google: false,
  openai: false,
  spotify: false,
  youtube: false,
  bahamut: false,
  netflix: false,
  tiktok: false,
  disney: false,
  pixiv: false,
  hbo: false,
  mediaHMT: false,
  biliintl: false,
  tvb: false,
  hulu: false,
  primevideo: false,
  telegram: false,
  line: false,
  whatsapp: false,
  games: false,
  japan: false,
  ads: false,
};

if (ruleSet === "all") {
  var keys = Object.keys(ruleOptions);
  for (var i = 0; i < keys.length; i++) {
    ruleOptions[keys[i]] = true;
  }
} else if (typeof ruleSet === "string") {
  var enabledKeys = ruleSet.split(";");
  for (var i = 0; i < enabledKeys.length; i++) {
    var key = enabledKeys[i].trim();
    if (ruleOptions.hasOwnProperty(key)) {
      ruleOptions[key] = true;
    }
  }
}

// 初始规则
var rules = [
  "RULE-SET,applications,下载软件",
  "RULE-SET,custom,直连",
  "PROCESS-NAME-REGEX,(?i).*Oray.*,直连",
  "PROCESS-NAME-REGEX,(?i).*Sunlogin.*,直连",
  "PROCESS-NAME-REGEX,(?i).*AweSun.*,直连",
  "PROCESS-NAME-REGEX,(?i).*NodeBaby.*,直连",
  "PROCESS-NAME-REGEX,(?i).*Node Baby.*,直连",
  "PROCESS-NAME-REGEX,(?i).*nblink.*,直连",
  "PROCESS-NAME-REGEX,(?i).*owjdxb.*,直连",
  "PROCESS-NAME-REGEX,(?i).*vpn.*,直连",
  "PROCESS-NAME-REGEX,(?i).*vnc.*,直连",
  "PROCESS-NAME-REGEX,(?i).*tvnserver.*,直连",
  "PROCESS-NAME-REGEX,(?i).*节点小宝.*,直连",
  "PROCESS-NAME-REGEX,(?i).*AnyDesk.*,直连",
  "PROCESS-NAME-REGEX,(?i).*ToDesk.*,直连",
  "PROCESS-NAME-REGEX,(?i).*RustDesk.*,直连",
  "PROCESS-NAME-REGEX,(?i).*TeamViewer.*,直连",
  "PROCESS-NAME-REGEX,(?i).*Zerotier.*,直连",
  "PROCESS-NAME-REGEX,(?i).*Tailscaled.*,直连",
  "PROCESS-NAME-REGEX,(?i).*phddns.*,直连",
  "PROCESS-NAME-REGEX,(?i).*ngrok.*,直连",
  "PROCESS-NAME-REGEX,(?i).*frpc.*,直连",
  "PROCESS-NAME-REGEX,(?i).*frps.*,直连",
  "PROCESS-NAME-REGEX,(?i).*natapp.*,直连",
  "PROCESS-NAME-REGEX,(?i).*cloudflared.*,直连",
  "PROCESS-NAME-REGEX,(?i).*xmqtunnel.*,直连",
  "PROCESS-NAME-REGEX,(?i).*Navicat.*,直连",
  "DOMAIN-SUFFIX,iepose.com,直连",
  "DOMAIN-SUFFIX,iepose.cn,直连",
  "DOMAIN-SUFFIX,nblink.cc,直连",
  "DOMAIN-SUFFIX,ionewu.com,直连",
  "DOMAIN-SUFFIX,vicp.net,直连",
  "DOMAIN-SUFFIX,h-e.top,直连",
];

// --- 地区定义 ---

var allRegionDefinitions = [
  {
    name: "HK香港",
    regex: /港|🇭🇰|hk|hongkong|hong kong/i,
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Hong_Kong.png",
    url: "https://www.youtube.com/",
  },
  {
    name: "US美国",
    regex: /(?!.*aus)(?=.*(美|🇺🇸|us(?!t)|usa|american|united states)).*/i,
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/United_States.png",
    url: "https://www.google.com/generate_204",
  },
  {
    name: "JP日本",
    regex: /日本|🇯🇵|jp|japan/i,
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Japan.png",
    url: "https://www.youtube.com/",
  },
  {
    name: "KR韩国",
    regex: /韩|🇰🇷|kr|korea/i,
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Korea.png",
    url: "https://www.youtube.com/",
  },
  {
    name: "SG新加坡",
    regex: /新加坡|🇸🇬|sg|singapore/i,
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Singapore.png",
    url: "https://www.youtube.com/",
  },
  {
    name: "CN中国大陆",
    regex: /中国|🇨🇳|cn|china/i,
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/China_Map.png",
    url: "https://wifi.vivo.com.cn/generate_204",
  },
  {
    name: "TW台湾省",
    regex: /台湾|台灣|🇹🇼|tw|taiwan|tai wan/i,
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/China.png",
    url: "https://www.youtube.com/",
  },
  {
    name: "GB英国",
    regex: /英|🇬🇧|uk|united kingdom|great britain/i,
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/United_Kingdom.png",
    url: "https://www.youtube.com/",
  },
  {
    name: "DE德国",
    regex: /德国|🇩🇪|de|germany/i,
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Germany.png",
    url: "https://www.youtube.com/",
  },
  {
    name: "MY马来西亚",
    regex: /马来|🇲🇾|my|malaysia/i,
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Malaysia.png",
    url: "https://www.youtube.com/",
  },
  {
    name: "TK土耳其",
    regex: /土耳其|🇹🇷|tk|turkey/i,
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Turkey.png",
    url: "https://www.youtube.com/",
  },
  {
    name: "CA加拿大",
    regex: /加拿大|🇨🇦|ca|canada/i,
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Canada.png",
    url: "https://www.youtube.com/",
  },
  {
    name: "AU澳大利亚",
    regex: /澳大利亚|🇦🇺|au|australia|sydney/i,
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Australia.png",
    url: "https://www.youtube.com/",
  },
];

var regionDefinitions = [];
if (regionSet === "all") {
  regionDefinitions = allRegionDefinitions;
} else {
  var enabledRegions = regionSet.split(";");
  for (var i = 0; i < allRegionDefinitions.length; i++) {
    var prefix = allRegionDefinitions[i].name.substring(0, 2);
    if (enabledRegions.indexOf(prefix) !== -1) {
      regionDefinitions.push(allRegionDefinitions[i]);
    }
  }
}

// --- DNS 配置模板 ---

var dnsConfig = {
  enable: true,
  listen: "0.0.0.0:53",
  ipv6: ipv6,
  "log-level": logLevel,
  "prefer-h3": true,
  "use-hosts": true,
  "use-system-hosts": true,
  "enhanced-mode": "fake-ip",
  "fake-ip-range": "198.18.0.0/16",
  "fake-ip-filter-mode": "whitelist",
  "fake-ip-filter": [
    "geosite:gfw",
    "geosite:jetbrains-ai",
    "geosite:category-ai-!cn",
    "geosite:category-ai-chat-!cn",
    "geosite:category-games-!cn",
    "geosite:google@!cn",
    "geosite:telegram",
    "geosite:facebook",
    "geosite:google",
    "geosite:amazon",
    "geosite:category-bank-jp",
  ],
  nameserver: chinaDNS,
  "default-nameserver": defaultDNS,
  "direct-nameserver": directDNS,
  "proxy-server-nameserver": chinaDNS,
  "nameserver-policy": {
    "geosite:private": "system",
    "geosite:tld-cn,cn,steam@cn,category-games@cn,microsoft@cn,apple@cn,category-game-platforms-download@cn,category-public-tracker":
      chinaDNS,
    "geosite:gfw,jetbrains-ai,category-ai-!cn,category-ai-chat-!cn": foreignDNS,
  },
};

// --- Rule Provider 通用配置 ---

var ruleProviderCommon = {
  type: "http",
  format: "yaml",
  interval: 86400,
};

var groupBaseOption = {
  interval: 300,
  timeout: 2000,
  url: "https://www.gstatic.com/generate_204",
  lazy: true,
  "max-failed-times": 3,
  hidden: false,
};

var ruleProviders = {
  applications: {
    type: "http",
    format: "yaml",
    interval: 86400,
    behavior: "classical",
    url: "https://github.com/DustinWin/ruleset_geodata/raw/refs/heads/mihomo-ruleset/applications.list",
    path: "./ruleset/DustinWin/applications.list",
  },
  custom: {
    type: "http",
    format: "yaml",
    interval: 86400,
    behavior: "classical",
    url: "https://github.com/DustinWin/ruleset_geodata/raw/refs/heads/mihomo-ruleset/applications.list",
    path: "./ruleset/DustinWin/custom.list",
  },
};

// 倍率正则预编译
var multiplierRegex =
  /(?<=[xX✕✖⨉倍率])([1-9]\d*(\.\d+)?|0\.\d+)(?=[xX✕✖⨉倍率])*/i;

// --- 2. 主入口 ---

function main(config) {
  log.info("Zephyr Override 启动 | 平台: " + env.platform + " | 订阅: " + env.profileName);
  log.info("规则集: " + ruleSet + " | 地区: " + regionSet);

  if (!enable) {
    log.info("脚本已禁用，跳过");
    return config;
  }

  var proxies = config.get("proxies") || [];
  var proxyProviderCount = 0;
  var pp = config.get("proxy-providers");
  if (pp && typeof pp === "object") {
    proxyProviderCount = Object.keys(pp).length;
  }

  if (proxies.length === 0 && proxyProviderCount === 0) {
    log.error("配置文件中未找到任何代理");
    return config;
  }

  log.info("代理节点数: " + proxies.length + " | 代理提供者: " + proxyProviderCount);

  // 3.1 基础配置覆盖
  config.set("allow-lan", true);
  config.set("bind-address", "*");
  config.set("mode", "rule");
  config.set("ipv6", ipv6);
  config.set("external-controller", "0.0.0.0:1906");
  config.set("mixed-port", 7890);
  config.set("redir-port", 7891);
  config.set("tproxy-port", 7892);
  config.set("external-ui", "ui");
  config.set("external-ui-url", githubProxy + "https://github.com/Zephyruso/zashboard/releases/latest/download/dist.zip");
  config.set("dns", dnsConfig);
  config.set("profile", {
    "store-selected": true,
    "store-fake-ip": true,
  });
  config.set("unified-delay", true);
  config.set("tcp-concurrent", true);
  config.set("keep-alive-interval", 1800);
  config.set("find-process-mode", "strict");
  config.set("geodata-mode", false);
  config.set("geodata-loader", "memconservative");
  config.set("geo-auto-update", true);
  config.set("geo-update-interval", 24);

  config.set("sniffer", {
    enable: true,
    "force-dns-mapping": true,
    "parse-pure-ip": false,
    "override-destination": true,
    sniff: {
      TLS: { ports: [443, 8443] },
      HTTP: { ports: [80, "8080-8880"] },
      QUIC: { ports: [443, 8443] },
    },
    "skip-src-address": skipIps,
    "skip-dst-address": skipIps,
    "force-domain": [
      "+.google.com",
      "+.googleapis.com",
      "+.googleusercontent.com",
      "+.youtube.com",
      "+.facebook.com",
      "+.messenger.com",
      "+.fbcdn.net",
      "fbcdn-a.akamaihd.net",
    ],
    "skip-domain": ["Mijia Cloud", "+.oray.com"],
  });

  config.set("ntp", {
    enable: true,
    "write-to-system": false,
    server: "cn.ntp.org.cn",
  });

  config.set("tun", {
    enable: true,
    stack: "mixed",
    device: "utun1999",
    "auto-route": true,
    "auto-redirect": true,
    "auto-detect-interface": true,
    "strict-route": true,
    mtu: 1500,
    gso: true,
    "gso-max-size": 65536,
    "exclude-interface": ["NodeBabyLink"],
    "route-exclude-address": skipIps.filter(function (ip) { return ip !== "198.18.0.0/16"; }),
    "dns-hijack": ["any:53", "tcp://any:53"],
  });

  config.set("geox-url", {
    geoip: githubProxy + "https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip-lite.dat",
    geosite: githubProxy + "https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geosite.dat",
    mmdb: githubProxy + "https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip.metadb",
    asn: githubProxy + "https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/GeoLite2-ASN.mmdb",
  });

  // 添加直连/拒绝虚拟代理
  proxies.push({ name: "直连", type: "direct", udp: true });
  proxies.push({ name: "拒绝", type: "reject", udp: true });
  config.set("proxies", proxies);

  // 3.2 按地区分类代理节点 (使用 regionDefinitions 的 regex 匹配)
  var regionGroups = {};
  for (var r = 0; r < regionDefinitions.length; r++) {
    regionGroups[regionDefinitions[r].name] = {
      name: regionDefinitions[r].name,
      icon: regionDefinitions[r].icon,
      url: regionDefinitions[r].url,
      proxies: [],
    };
  }
  var allProxies = [];

  for (var i = 0; i < proxies.length; i++) {
    var name = proxies[i].name || "";

    // 倍率过滤：高倍率节点不加入任何组
    if (excludeHighPercentage) {
      var match = multiplierRegex.exec(name);
      if (match && parseFloat(match[1]) > globalRatioLimit) {
        continue;
      }
    }

    allProxies.push(name);

    // 尝试匹配地区
    for (var r = 0; r < regionDefinitions.length; r++) {
      if (regionDefinitions[r].regex.test(name)) {
        regionGroups[regionDefinitions[r].name].proxies.push(name);
        break;
      }
    }
  }

  // 创建地区策略组
  var newGroups = [];
  var regionGroupNames = [];

  for (var r = 0; r < regionDefinitions.length; r++) {
    var groupData = regionGroups[regionDefinitions[r].name];
    if (groupData.proxies.length === 0) continue;
    var groupName = groupData.name;
    regionGroupNames.push(groupName);
    newGroups.push({
      ...groupBaseOption,
      name: groupName,
      type: "url-test",
      tolerance: 50,
      icon: groupData.icon,
      proxies: groupData.proxies,
    });
  }

  // 所有节点组
  newGroups.push({
    ...groupBaseOption,
    name: "所有节点",
    type: "url-test",
    interval: 60,
    timeout: 1500,
    tolerance: 50,
    proxies: allProxies,
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Rocket.png",
  });

  // 默认节点选择组
  newGroups.push({
    ...groupBaseOption,
    name: "默认节点",
    type: "select",
    proxies: allProxies.concat(["直连"]),
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Proxy.png",
  });

  // 3.3 服务分流规则 & 策略组
  var serviceConfigs = [
    {
      key: "openai", name: "国外AI",
      icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/ChatGPT.png",
      url: "https://chat.openai.com/cdn-cgi/trace",
      rules: [
        "GEOSITE,jetbrains-ai,国外AI",
        "GEOSITE,category-ai-!cn,国外AI",
        "GEOSITE,category-ai-chat-!cn,国外AI",
        "DOMAIN-SUFFIX,meta.ai,国外AI",
        "DOMAIN-SUFFIX,meta.com,国外AI",
        "PROCESS-NAME-REGEX,(?i).*Antigravity.*,国外AI",
        "PROCESS-NAME-REGEX,(?i).*language_server_.*,国外AI",
      ],
    },
    {
      key: "youtube", name: "YouTube",
      icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/YouTube.png",
      url: "https://www.youtube.com/s/desktop/494dd881/img/favicon.ico",
      rules: ["GEOSITE,youtube,YouTube"],
    },
    {
      key: "mediaHMT", name: "港澳台媒体",
      icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/TVB.png",
      url: "https://viu.tv/",
      rules: [
        "GEOSITE,tvb,港澳台媒体",
        "GEOSITE,hkt,港澳台媒体",
        "GEOSITE,hkbn,港澳台媒体",
        "GEOSITE,hkopentv,港澳台媒体",
        "GEOSITE,hkedcity,港澳台媒体",
        "GEOSITE,hkgolden,港澳台媒体",
        "GEOSITE,hketgroup,港澳台媒体",
        "RULE-SET,hk-media,港澳台媒体",
        "RULE-SET,tw-media,港澳台媒体",
      ],
      providers: [
        {
          key: "hk-media",
          url: "https://ruleset.skk.moe/Clash/non_ip/stream_hk.txt",
          path: "./ruleset/ruleset.skk.moe/stream_hk.txt",
          format: "text",
          behavior: "classical",
        },
        {
          key: "tw-media",
          url: "https://ruleset.skk.moe/Clash/non_ip/stream_tw.txt",
          path: "./ruleset/ruleset.skk.moe/stream_tw.txt",
          format: "text",
          behavior: "classical",
        },
      ],
    },
    {
      key: "biliintl", name: "哔哩哔哩东南亚",
      icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/bilibili_3.png",
      url: "https://www.bilibili.tv/",
      rules: ["GEOSITE,biliintl,哔哩哔哩东南亚"],
    },
    {
      key: "bahamut", name: "巴哈姆特",
      icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Bahamut.png",
      url: "https://ani.gamer.com.tw/ajax/getdeviceid.php",
      rules: ["GEOSITE,bahamut,巴哈姆特"],
    },
    {
      key: "disney", name: "Disney+",
      icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Disney+.png",
      url: "https://disney.api.edge.bamgrid.com/devices",
      rules: ["GEOSITE,disney,Disney+"],
    },
    {
      key: "netflix", name: "NETFLIX",
      icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Netflix.png",
      url: "https://api.fast.com/netflix/speedtest/v2?https=true",
      rules: ["GEOSITE,netflix,NETFLIX"],
    },
    {
      key: "tiktok", name: "Tiktok",
      icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/TikTok.png",
      url: "https://www.tiktok.com/",
      rules: ["GEOSITE,tiktok,Tiktok"],
    },
    {
      key: "spotify", name: "Spotify",
      icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Spotify.png",
      url: "https://spclient.wg.spotify.com/signup/public/v1/account",
      rules: ["GEOSITE,spotify,Spotify"],
    },
    {
      key: "pixiv", name: "Pixiv",
      icon: "https://play-lh.googleusercontent.com/8pFuLOHF62ADcN0ISUAyEueA5G8IF49mX_6Az6pQNtokNVHxIVbS1L2NM62H-k02rLM=w240-h480-rw",
      url: "http://spclient.wg.spotify.com/signup/public/v1/account",
      rules: ["GEOSITE,pixiv,Pixiv"],
    },
    {
      key: "hbo", name: "HBO",
      icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/HBO.png",
      url: "https://www.hbo.com/favicon.ico",
      rules: ["GEOSITE,hbo,HBO"],
    },
    {
      key: "primevideo", name: "Prime Video",
      icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Prime_Video.png",
      url: "https://m.media-amazon.com/images/G/01/digital/video/web/logo-min-remaster.png",
      rules: ["GEOSITE,primevideo,Prime Video"],
    },
    {
      key: "hulu", name: "Hulu",
      icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Hulu.png",
      url: "https://auth.hulu.com/v4/web/password/authenticate",
      rules: ["GEOSITE,hulu,Hulu"],
    },
    {
      key: "telegram", name: "Telegram",
      icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Telegram.png",
      url: "https://www.telegram.org/img/website_icon.svg",
      rules: ["GEOIP,telegram,Telegram"],
    },
    {
      key: "whatsapp", name: "WhatsApp",
      icon: "https://static.whatsapp.net/rsrc.php/v3/yP/r/rYZqPCBaG70.png",
      url: "https://web.whatsapp.com/data/manifest.json",
      rules: ["GEOSITE,whatsapp,WhatsApp"],
    },
    {
      key: "line", name: "Line",
      icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Line.png",
      url: "https://line.me/page-data/app-data.json",
      rules: ["GEOSITE,line,Line"],
    },
    {
      key: "games", name: "游戏专用",
      icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Game.png",
      rules: [
        "GEOSITE,category-games@cn,国内网站",
        "GEOSITE,category-games,游戏专用",
      ],
    },
    {
      key: "ads", name: "广告过滤",
      icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Advertising.png",
      rules: [
        "GEOSITE,category-ads-all,广告过滤",
        "RULE-SET,adblockmihomo,广告过滤",
      ],
      providers: [
        {
          key: "adblockmihomo",
          url: "https://github.com/217heidai/adblockfilters/raw/refs/heads/main/rules/adblockmihomo.mrs",
          path: "./ruleset/adblockfilters/adblockmihomo.mrs",
          format: "mrs",
          behavior: "domain",
        },
      ],
      reject: true,
    },
    {
      key: "apple", name: "苹果服务",
      icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Apple_2.png",
      url: "https://www.apple.com/library/test/success.html",
      rules: ["GEOSITE,apple-cn,苹果服务"],
    },
    {
      key: "google", name: "谷歌服务",
      icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Google_Search.png",
      url: "https://www.google.com/generate_204",
      rules: ["GEOSITE,google,谷歌服务"],
    },
    {
      key: "github", name: "Github",
      icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/GitHub.png",
      url: "https://github.com/robots.txt",
      rules: ["GEOSITE,github,Github"],
    },
    {
      key: "microsoft", name: "微软服务",
      icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Microsoft.png",
      url: "https://www.msftconnecttest.com/connecttest.txt",
      rules: ["GEOSITE,microsoft@cn,国内网站", "GEOSITE,microsoft,微软服务"],
    },
    {
      key: "japan", name: "日本网站",
      icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/JP.png",
      url: "https://r.r10s.jp/com/img/home/logo/touch.png",
      rules: [
        "RULE-SET,category-bank-jp,日本网站",
        "GEOIP,jp,日本网站,no-resolve",
      ],
      providers: [
        {
          key: "category-bank-jp",
          url: "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/category-bank-jp.mrs",
          path: "./ruleset/MetaCubeX/category-bank-jp.mrs",
          format: "mrs",
          behavior: "domain",
        },
      ],
    },
  ];

  for (var i = 0; i < serviceConfigs.length; i++) {
    var svc = serviceConfigs[i];
    if (!ruleOptions[svc.key]) continue;

    rules = rules.concat(svc.rules);

    if (Array.isArray(svc.providers)) {
      for (var j = 0; j < svc.providers.length; j++) {
        var p = svc.providers[j];
        ruleProviders[p.key] = {
          type: "http",
          format: "yaml",
          interval: 86400,
          behavior: p.behavior,
          url: p.url,
          path: p.path,
        };
      }
    }

    var groupProxies;
    if (svc.reject) {
      groupProxies = ["REJECT", "直连", "所有节点"];
    } else if (svc.key === "biliintl" || svc.key === "bahamut") {
      groupProxies = ["所有节点", "直连"].concat(regionGroupNames);
    } else {
      groupProxies = ["所有节点"].concat(regionGroupNames).concat(["直连"]);
    }

    newGroups.push({
      ...groupBaseOption,
      name: svc.name,
      type: "select",
      proxies: groupProxies,
      url: svc.url,
      icon: svc.icon,
    });
  }

  // 3.4 通用兜底规则 & 策略组
  rules.push(
    "GEOSITE,private,直连",
    "GEOSITE,category-public-tracker,直连",
    "GEOSITE,category-game-platforms-download@cn,直连",
    "GEOIP,private,直连,no-resolve",
    "GEOSITE,cn,国内网站",
    "GEOIP,cn,国内网站,no-resolve",
    "MATCH,其他外网"
  );

  newGroups.push(
    {
      ...groupBaseOption,
      name: "下载软件",
      type: "select",
      proxies: ["直连", "REJECT", "所有节点", "默认节点", "国内网站"].concat(regionGroupNames),
      icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Download.png",
    },
    {
      ...groupBaseOption,
      name: "其他外网",
      type: "select",
      proxies: ["所有节点", "默认节点", "国内网站"].concat(regionGroupNames),
      icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Streaming!CN.png",
    },
    {
      ...groupBaseOption,
      name: "国内网站",
      type: "select",
      proxies: ["直连", "所有节点", "默认节点"].concat(regionGroupNames),
      url: "https://wifi.vivo.com.cn/generate_204",
      icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/StreamingCN.png",
    }
  );

  // 3.5 写入最终配置
  config.set("proxy-groups", newGroups);
  config.set("rules", rules);
  config.set("rule-providers", ruleProviders);

  log.info("Override 完成 | 策略组: " + newGroups.length + " | 规则: " + rules.length);

  return config;
}
