// ==UserScript==
// @name         小白素材解析工具
// @namespace    https://local.xiaobai.doubao-rmark/
// @version      0.2.0
// @description  在豆包页面右下角一键解析当前页面图片和视频，并自动携带可读取的登录 Cookie。
// @match        https://www.doubao.com/thread/*
// @match        https://www.doubao.com/chat/*
// @match        https://www.qianwen.com/chat/*
// @match        https://www.qianwen.com/share/chat/*
// @grant        GM_download
// @grant        unsafeWindow
// @connect      *
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";

  const ROOT_ID = "xiaobai-helper-root";
  const pageWindow = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
  const shareUrlCache = [];
  const chatImages = [];
  const chatVideos = [];

  if (document.getElementById(ROOT_ID)) {
    return;
  }

  function style() {
    const el = document.createElement("style");
    el.textContent = `
      #${ROOT_ID}{position:fixed;right:22px;bottom:22px;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;color:#181818}
      .xiaobai-helper-button{width:52px;height:52px;border:0;border-radius:999px;background:#1e3328;color:#fff;box-shadow:0 14px 38px rgba(15,23,18,.24);cursor:pointer;display:flex;align-items:center;justify-content:center}
      .xiaobai-helper-button svg{width:25px;height:25px}
      .xiaobai-helper-panel{position:absolute;right:0;bottom:64px;width:min(360px,calc(100vw - 28px));max-height:min(560px,calc(100vh - 112px));overflow:hidden;border:1px solid rgba(30,51,40,.18);border-radius:10px;background:#fffefa;box-shadow:0 24px 70px rgba(15,23,18,.22);display:none}
      .xiaobai-helper-panel.is-open{display:block}
      .xiaobai-helper-head{padding:14px 15px;border-bottom:1px solid #e2ddd2;display:flex;align-items:center;justify-content:space-between;gap:12px}
      .xiaobai-helper-title{font-size:15px;font-weight:650}
      .xiaobai-helper-close{border:0;background:transparent;color:#6b675f;cursor:pointer;font-size:20px;line-height:1}
      .xiaobai-helper-body{padding:12px;overflow:auto;max-height:calc(min(560px,calc(100vh - 112px)) - 50px)}
      .xiaobai-helper-status{color:#6b675f;font-size:13px;line-height:1.55}.xiaobai-helper-status.is-error{color:#a32323}
      .xiaobai-helper-list{display:flex;flex-direction:column;gap:10px}.xiaobai-helper-card{border:1px solid #e2ddd2;border-radius:8px;overflow:hidden;background:#fbfaf6}
      .xiaobai-helper-card img,.xiaobai-helper-card video{display:block;width:100%;max-height:210px;object-fit:contain;background:#111}.xiaobai-helper-card img{background:#ede9df}
      .xiaobai-helper-meta{padding:9px 10px;color:#6b675f;font-size:12px;border-top:1px solid #e2ddd2}
      .xiaobai-helper-actions{display:flex;gap:8px;padding:0 10px 10px}
      .xiaobai-helper-actions button,.xiaobai-helper-actions a{flex:1 1 0;min-height:32px;border:1px solid #bdb7aa;border-radius:6px;background:#fffefa;color:#181818;font-size:13px;cursor:pointer;text-decoration:none;display:flex;align-items:center;justify-content:center}
    `;
    document.head.appendChild(el);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function humanMessage(value) {
    if (value == null) return "";
    if (typeof value === "string") return value;
    if (value.message && typeof value.message === "string") return value.message;
    if (value.detail && typeof value.detail === "string") return value.detail;
    if (Array.isArray(value.detail)) {
      return value.detail.map(humanMessage).filter(Boolean).join("；");
    }
    if (value.loc && value.msg) {
      return `${Array.isArray(value.loc) ? value.loc.join(".") : value.loc}: ${value.msg}`;
    }
    try {
      return JSON.stringify(value, null, 2);
    } catch (_) {
      return String(value);
    }
  }

  function cleanUrl(url) {
    return String(url || "").trim().replace(/[.,;:!?)>\]}。，；：！？、）】》]+$/g, "");
  }

  function isSupportedShareUrl(url) {
    const value = cleanUrl(url);
    return /https:\/\/www\.doubao\.com\/thread\//.test(value)
      || /https:\/\/www\.doubao\.com\/video-sharing/.test(value)
      || /https:\/\/videoweb-download\.doubao\.com\//.test(value)
      || /https:\/\/www\.qianwen\.com\/share\/chat\//.test(value)
      || /https:\/\/xiaoyunque\.jianying\.com\//.test(value);
  }

  function extractSupportedShareUrl(text) {
    const normalized = String(text || "")
      .replace(/\\u002F/gi, "/")
      .replace(/\\\//g, "/")
      .replace(/&amp;/g, "&");
    const absoluteMatches = normalized.match(/https?:\/\/[^\s"'<>\\]+/g) || [];
    const absolute = cleanUrl(absoluteMatches.find(isSupportedShareUrl) || "");
    if (absolute) return absolute;

    const doubaoThread = normalized.match(/\/thread\/[A-Za-z0-9_-]+[^\s"'<>\\]*/);
    if (doubaoThread) return cleanUrl(`https://www.doubao.com${doubaoThread[0]}`);

    const doubaoVideo = normalized.match(/\/video-sharing[^\s"'<>\\]*/);
    if (doubaoVideo) return cleanUrl(`https://www.doubao.com${doubaoVideo[0]}`);

    const qianwenShare = normalized.match(/\/share\/chat\/[A-Za-z0-9_-]+[^\s"'<>\\]*/);
    if (qianwenShare) return cleanUrl(`https://www.qianwen.com${qianwenShare[0]}`);

    return "";
  }

  function shareIdToUrl(value) {
    const id = String(value || "").trim();
    if (!/^[A-Za-z0-9_-]{8,}$/.test(id)) return "";
    return `https://www.doubao.com/thread/${id}`;
  }

  function rememberShareUrl(text) {
    const url = extractSupportedShareUrl(text);
    if (!url || shareUrlCache.includes(url)) return url;
    shareUrlCache.unshift(url);
    shareUrlCache.splice(8);
    return url;
  }

  function latestShareUrl() {
    return shareUrlCache.find(isSupportedShareUrl) || "";
  }

  function scanObjectForShareUrl(value, depth = 0) {
    if (!value || depth > 7) return "";
    if (typeof value === "string") return rememberShareUrl(value);
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = scanObjectForShareUrl(item, depth + 1);
        if (found) return found;
      }
      return "";
    }
    if (typeof value === "object") {
      for (const [key, item] of Object.entries(value)) {
        const lowerKey = key.toLowerCase();
        if (typeof item === "string") {
          const direct = rememberShareUrl(item);
          if (direct) return direct;
          if (lowerKey.includes("share") && lowerKey.includes("id")) {
            const built = shareIdToUrl(item);
            if (built) return rememberShareUrl(built);
          }
        }
        const found = scanObjectForShareUrl(item, depth + 1);
        if (found) return found;
      }
    }
    return "";
  }

  function addChatImage(image) {
    if (!image?.url || chatImages.some((item) => item.url === image.url)) return;
    chatImages.push({
      url: image.url,
      width: image.width || 0,
      height: image.height || 0
    });
  }

  function addChatVideo(video) {
    if (!video?.url && !video?.vid) return;
    const existing = chatVideos.find((item) => (video.url && item.url === video.url) || (video.vid && item.vid === video.vid));
    if (existing) {
      Object.assign(existing, {
        vid: video.vid || existing.vid || "",
        url: video.url || existing.url || "",
        width: video.width || existing.width || 0,
        height: video.height || existing.height || 0,
        cover: video.cover || video.poster_url || existing.cover || ""
      });
      return;
    }
    chatVideos.push({
      vid: video.vid || "",
      url: video.url || "",
      width: video.width || 0,
      height: video.height || 0,
      cover: video.cover || video.poster_url || ""
    });
  }

  async function getDoubaoVideoInfo(vid) {
    if (!vid) return null;
    const params = new URLSearchParams({
      version_code: "20800",
      language: "zh-CN",
      device_platform: "web",
      aid: "497858",
      real_aid: "497858",
      pkg_type: "release_version",
      device_id: "",
      pc_version: "2.51.7",
      region: "",
      sys_region: "",
      samantha_web: "1",
      "use-olympus-account": "1",
      web_tab_id: ""
    });
    try {
      const response = await pageWindow.fetch(`https://www.doubao.com/samantha/media/get_play_info?${params}`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ key: vid })
      });
      const result = await response.json();
      const original = result?.data?.original_media_info || {};
      const meta = original.meta || {};
      if (!original.main_url) return null;
      return {
        vid,
        url: original.main_url,
        width: meta.width || 0,
        height: meta.height || 0,
        cover: result.data.poster_url || ""
      };
    } catch (_) {
      return null;
    }
  }

  function isLikelyVideoUrl(url) {
    const value = String(url || "").toLowerCase();
    return /^https?:\/\//.test(value) && (
      value.includes("mime_type=video")
      || value.includes("videoweb")
      || value.includes("douyinvod")
      || value.includes("doubaocdn")
      || value.includes("/video/tos/")
      || value.includes("/video/fplay/")
      || /\.(mp4|m4v|mov|webm)(\?|$)/.test(value)
    );
  }

  function isWatermarkedVideoUrl(url) {
    const value = String(url || "").toLowerCase();
    return value.includes("video_gen_watermark")
      || value.includes("watermark_dyn")
      || value.includes("water_mark")
      || value.includes("logo_type=")
      || value.includes("template=watermark");
  }

  function collectStableMediaKeys(text) {
    const value = String(text || "");
    const matches = [
      ...(value.match(/\b(?:v0|x)[a-z0-9]{20,64}\b/gi) || []),
      ...(value.match(/tos-[a-z0-9-]+\/[a-z0-9._~%-]{16,}/gi) || [])
    ];
    return [...new Set(matches.map((item) => item.toLowerCase()))].slice(0, 80);
  }

  function collectVideoCandidates(value, out = [], seen = new Set()) {
    if (value == null) return out;
    if (typeof value === "string") {
      const text = value.replace(/&amp;/g, "&");
      if (isLikelyVideoUrl(text)) out.push({ url: text });
      return out;
    }
    if (typeof value !== "object") return out;
    if (seen.has(value)) return out;
    seen.add(value);

    if (Array.isArray(value)) {
      value.forEach((item) => collectVideoCandidates(item, out, seen));
      return out;
    }

    for (const [key, child] of Object.entries(value)) {
      if (typeof child === "string" && isLikelyVideoUrl(child)) {
        out.push({
          ...value,
          url: child.replace(/&amp;/g, "&"),
          candidate_path: key
        });
      } else {
        collectVideoCandidates(child, out, seen);
      }
    }
    return out;
  }

  async function postDoubaoJson(path, body) {
    const params = new URLSearchParams({
      version_code: "20800",
      language: "zh-CN",
      device_platform: "web",
      aid: "497858",
      real_aid: "497858",
      pkg_type: "release_version",
      samantha_web: "1",
      "use-olympus-account": "1"
    });
    const response = await pageWindow.fetch(`https://www.doubao.com${path}?${params}`, {
      method: "POST",
      credentials: "include",
      headers: {
        "accept": "application/json",
        "content-type": "application/json; encoding=utf-8",
        "agw-js-conv": "str",
        "Agw-Js-Conv": "str"
      },
      body: JSON.stringify(body || {})
    });
    if (!response.ok) throw new Error(`${path} HTTP ${response.status}`);
    return response.text().then((text) => text ? JSON.parse(text) : {});
  }

  function firstText(...values) {
    for (const value of values) {
      if (value == null) continue;
      const text = String(value).trim();
      if (text) return text;
    }
    return "";
  }

  function collectAispaceVideoNodes(value, source, out = [], seen = new Set()) {
    if (!value || typeof value !== "object") return out;
    if (seen.has(value)) return out;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach((item) => collectAispaceVideoNodes(item, source, out, seen));
      return out;
    }

    const content = typeof value.content === "object" && value.content ? value.content : {};
    const node = typeof value.node === "object" && value.node ? value.node : {};
    const rawText = JSON.stringify(value);
    const embeddedVid = (rawText.match(/\bv0[a-z0-9]{20,64}\b/i) || [""])[0];
    const nodeId = firstText(value.id, value.node_id, value.nodeId, node.id, content.id);
    const key = firstText(value.key, value.uri, value.resource_uri, value.resourceUri, value.media_uri, value.mediaUri, content.key, content.uri, embeddedVid);
    const nodeType = firstText(value.node_type, value.nodeType, value.type, content.node_type, content.type);
    const name = firstText(value.name, value.title, value.file_name, value.fileName, content.name, content.title);
    const mediaKeys = collectStableMediaKeys(rawText);
    const isVideo = nodeType === "6" || /video|mp4|mov|media/i.test(`${nodeType} ${name} ${key} ${rawText.slice(0, 3000)}`);
    if (nodeId && isVideo) {
      out.push({ id: nodeId, key: key || nodeId, uri: key || nodeId, nodeType, name, source, rawText: rawText.slice(0, 6000), mediaKeys });
    }

    Object.values(value).forEach((item) => collectAispaceVideoNodes(item, source, out, seen));
    return out;
  }

  function findAispaceNode(nodes, vid) {
    const sample = String(vid || "").toLowerCase();
    if (!sample) return null;
    let best = null;
    for (const node of nodes) {
      const mediaKeys = (node.mediaKeys || []).map(String);
      const haystack = [node.id, node.key, node.uri, node.name, node.rawText, ...mediaKeys].join("\n").toLowerCase();
      let score = 0;
      if ([node.id, node.key, node.uri].map((item) => String(item || "").toLowerCase()).includes(sample) || mediaKeys.includes(sample)) score += 12000;
      else if (haystack.includes(sample)) score += 7000;
      if (score && node.source && String(node.source).includes("node-info")) score += 180;
      if (score && node.nodeType === "6") score += 160;
      if (score && (!best || score > best.score)) best = { node, score };
    }
    return best?.score >= 6500 ? best.node : null;
  }

  async function collectAispaceNodes() {
    const nodes = [];
    const remember = (payload, source) => collectAispaceVideoNodes(payload, source, nodes);
    const homepage = await postDoubaoJson("/samantha/aispace/homepage", {}).catch(() => null);
    remember(homepage, "aispace-homepage");
    const folderIds = (((homepage || {}).data || {}).children || []).map((child) => firstText(child?.id, child?.node_id, child?.nodeId)).filter(Boolean).slice(0, 8);

    for (const tabType of [2, 0]) {
      const payload = await postDoubaoJson("/samantha/aispace/node_lastest_used", { cursor: "0", size: 100, tab_type: tabType }).catch(() => null);
      remember(payload, `aispace-node-lastest-used-${tabType}`);
    }
    for (const fileType of [[4, 6], [4], [6], [3, 4], ["video"], ["media"]]) {
      const payload = await postDoubaoJson("/samantha/aispace/attachment_latest_used", { file_type: fileType, limit: 100 }).catch(() => null);
      remember(payload, `aispace-attachment-latest-${fileType.join("-")}`);
    }
    for (const folderId of folderIds) {
      let cursor = "0";
      for (let pageIndex = 0; pageIndex < 3; pageIndex += 1) {
        const payload = await postDoubaoJson("/samantha/aispace/node_info", { node_id: folderId, cursor, size: 100 }).catch(() => null);
        remember(payload, `aispace-node-info-${folderId}-${pageIndex}`);
        const data = payload?.data || {};
        const nextCursor = firstText(data.next_cursor, data.nextCursor);
        if (!data.has_more || !nextCursor || nextCursor === cursor) break;
        cursor = nextCursor;
      }
    }
    return nodes;
  }

  async function getCleanDownloadByNode(node, vid) {
    const payload = await postDoubaoJson("/samantha/aispace/get_download_info", { requests: [{ node_id: node.id }] });
    const candidates = collectVideoCandidates(payload)
      .filter((item) => item.url && !isWatermarkedVideoUrl(item.url));
    if (!candidates.length) return null;
    const selected = candidates[0];
    return {
      vid,
      url: selected.url,
      width: selected.width || 0,
      height: selected.height || 0,
      cover: selected.cover || selected.poster || "",
      source: "aispace_download_info"
    };
  }

  async function resolveDoubaoVideoNoWatermark(vid) {
    const nodes = await collectAispaceNodes();
    const matched = findAispaceNode(nodes, vid);
    if (matched) {
      const clean = await getCleanDownloadByNode(matched, vid).catch(() => null);
      if (clean) return clean;
    }
    const unique = [...new Map(nodes.filter((node) => node.id).map((node) => [node.id, node])).values()];
    for (const node of unique.slice(0, 12)) {
      const clean = await getCleanDownloadByNode(node, vid).catch(() => null);
      if (clean) return clean;
    }
    const fallback = await getDoubaoVideoInfo(vid);
    if (fallback && !isWatermarkedVideoUrl(fallback.url)) return fallback;
    throw new Error("未拿到官方无水印视频源，请确认该视频在当前登录账号的豆包空间中。");
  }

  function parseCreation(creation) {
    if (!creation || typeof creation !== "object") return;
    const vid = creation.video?.vid || creation.video?.key || creation.vid;
    if (vid) {
      addChatVideo({ vid });
      getDoubaoVideoInfo(vid).then(addChatVideo);
      return;
    }

    const imageData = creation.image?.image_ori_raw || creation.image_ori_raw || creation.image_ori;
    if (!imageData) return;
    if (typeof imageData === "string") {
      addChatImage({ url: imageData });
    } else if (imageData.url) {
      addChatImage({
        url: String(imageData.url).replace(/&amp;/g, "&"),
        width: imageData.width || 0,
        height: imageData.height || 0
      });
    }
  }

  function scanObjectForMedia(value, depth = 0) {
    if (!value || depth > 9) return;
    if (typeof value === "string") {
      const text = value.trim();
      if ((text.startsWith("{") && text.endsWith("}")) || (text.startsWith("[") && text.endsWith("]"))) {
        try {
          scanObjectForMedia(JSON.parse(text), depth + 1);
        } catch (_) {
          // Ignore non-JSON strings.
        }
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) scanObjectForMedia(item, depth + 1);
      return;
    }
    if (typeof value !== "object") return;

    if (Array.isArray(value.creations)) {
      for (const creation of value.creations) parseCreation(creation);
    }
    if (Array.isArray(value.content_block)) {
      for (const block of value.content_block) scanObjectForMedia(block, depth + 1);
    }
    if (value.creation_block?.creations) {
      scanObjectForMedia(value.creation_block, depth + 1);
    }
    if (value.content_v2) {
      scanObjectForMedia(value.content_v2, depth + 1);
    }
    if (value.event_data) {
      scanObjectForMedia(value.event_data, depth + 1);
    }
    if (value.patch_op) {
      scanObjectForMedia(value.patch_op, depth + 1);
    }

    for (const item of Object.values(value)) {
      scanObjectForMedia(item, depth + 1);
    }
  }

  function scanTextForMedia(text) {
    if (!text || typeof text !== "string") return;
    const vids = text.match(/\bv0[a-z0-9]{20,64}\b/gi) || [];
    for (const vid of vids) addChatVideo({ vid });
    try {
      scanObjectForMedia(JSON.parse(text));
    } catch (_) {
      const unescaped = text.replace(/&quot;/g, '"').replace(/&amp;/g, "&");
      if (unescaped !== text) {
        try {
          scanObjectForMedia(JSON.parse(unescaped));
        } catch (_) {
          // Ignore non-JSON text.
        }
      }
    }
  }

  function scanTextForShareAndMedia(text) {
    rememberShareUrl(text);
    scanTextForMedia(text);
    try {
      const payload = JSON.parse(text);
      scanObjectForShareUrl(payload);
      scanObjectForMedia(payload);
    } catch (_) {
      // Non-JSON text is still useful for URL regex scanning above.
    }
  }

  function directChatImageResult() {
    if (!chatImages.length) return null;
    return {
      success: true,
      type: "image",
      image_count: chatImages.length,
      video_count: 0,
      images: [...chatImages],
      videos: []
    };
  }

  function scanExistingPageState() {
    scanObjectForMedia(pageWindow.__INITIAL_STATE__ || pageWindow.__NUXT__ || pageWindow.__NEXT_DATA__ || "");
    scanObjectForShareUrl(pageWindow.__INITIAL_STATE__ || pageWindow.__NUXT__ || pageWindow.__NEXT_DATA__ || "");
    for (const script of document.querySelectorAll("script")) {
      scanTextForMedia(script.textContent || "");
      rememberShareUrl(script.textContent || "");
      const dataArgs = script.getAttribute("data-fn-args");
      if (dataArgs) {
        const unescaped = dataArgs.replace(/&quot;/g, '"').replace(/&amp;/g, "&");
        scanTextForMedia(unescaped);
        rememberShareUrl(unescaped);
      }
    }
  }

  function installShareLinkHooks() {
    const clipboard = pageWindow.navigator?.clipboard;
    if (clipboard?.writeText && !clipboard.writeText.__xiaobaiPatched) {
      try {
        const originalWriteText = clipboard.writeText.bind(clipboard);
        clipboard.writeText = function (text) {
          rememberShareUrl(text);
          return originalWriteText(text);
        };
        clipboard.writeText.__xiaobaiPatched = true;
      } catch (_) {
        // Some browsers expose clipboard methods as read-only.
      }
    }

    if (pageWindow.fetch && !pageWindow.fetch.__xiaobaiPatched) {
      const originalFetch = pageWindow.fetch.bind(pageWindow);
      pageWindow.fetch = async function (...args) {
        const requestUrl = String(args[0]?.url || args[0] || "");
        const response = await originalFetch(...args);
        try {
          if (!requestUrl.includes("doubao.com") && !requestUrl.includes("qianwen.com")) {
            return response;
          }
          response.clone().text().then(scanTextForShareAndMedia).catch(() => {});
        } catch (_) {
          // Ignore opaque/streaming responses.
        }
        return response;
      };
      pageWindow.fetch.__xiaobaiPatched = true;
    }

    const xhrProto = pageWindow.XMLHttpRequest?.prototype;
    if (xhrProto && !xhrProto.__xiaobaiPatched) {
      const originalOpen = xhrProto.open;
      const originalSend = xhrProto.send;
      xhrProto.open = function (method, url, ...rest) {
        this.__xiaobaiUrl = url;
        rememberShareUrl(url);
        return originalOpen.call(this, method, url, ...rest);
      };
      xhrProto.send = function (...args) {
        this.addEventListener("load", function () {
          try {
            rememberShareUrl(this.responseURL || this.__xiaobaiUrl || "");
            if (typeof this.responseText === "string") {
              scanTextForShareAndMedia(this.responseText);
            }
          } catch (_) {
            // Some response types disallow responseText.
          }
        });
        return originalSend.apply(this, args);
      };
      xhrProto.__xiaobaiPatched = true;
    }
  }

  function installShareLinkObserver() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.TEXT_NODE) {
            rememberShareUrl(node.textContent || "");
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            rememberShareUrl(node.outerHTML || node.textContent || "");
          }
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    const styleValue = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && styleValue.visibility !== "hidden" && styleValue.display !== "none";
  }

  function findShareUrlInPage() {
    const cached = latestShareUrl();
    if (cached) return cached;

    if (isSupportedShareUrl(location.href)) {
      return cleanUrl(location.href);
    }
    const metaUrl = document.querySelector('link[rel="canonical"], meta[property="og:url"], meta[name="twitter:url"]')?.content
      || document.querySelector('link[rel="canonical"]')?.href;
    if (isSupportedShareUrl(metaUrl)) {
      return cleanUrl(metaUrl);
    }
    for (const element of document.querySelectorAll("a[href], [data-url], [data-link], [data-clipboard-text]")) {
      const value = element.href || element.dataset.url || element.dataset.link || element.dataset.clipboardText || "";
      const found = extractSupportedShareUrl(value);
      if (found) return found;
    }
    return extractSupportedShareUrl(document.body?.innerText || "");
  }

  async function readClipboardShareUrl() {
    try {
      if (!navigator.clipboard?.readText) return "";
      return extractSupportedShareUrl(await navigator.clipboard.readText());
    } catch (_) {
      return "";
    }
  }

  function findClickableByText(patterns) {
    const candidates = Array.from(document.querySelectorAll('button, [role="button"], a, [aria-label], [title]'));
    return candidates
      .filter(isVisible)
      .filter((element) => {
        const text = `${element.innerText || ""} ${element.getAttribute("aria-label") || ""} ${element.getAttribute("title") || ""}`;
        return patterns.some((pattern) => pattern.test(text));
      })
      .pop();
  }

  function findDoubaoShareButtonByIcon() {
    const buttons = Array.from(document.querySelectorAll('button[data-dbx-name="button"], button[data-trigger-type="hover"], button'));
    return buttons
      .filter(isVisible)
      .filter((button) => {
        if (button.closest(`#${ROOT_ID}`)) return false;
        const text = `${button.innerText || ""} ${button.getAttribute("aria-label") || ""} ${button.getAttribute("title") || ""}`;
        if (/分享|share/i.test(text)) return true;
        return Boolean(button.querySelector('svg path[d^="M11.052 3.80762"], svg path[d*="20.722 8.74802"]'));
      })
      .pop();
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function dispatchMouse(element, type) {
    const view = element.ownerDocument?.defaultView;
    const EventCtor = view?.MouseEvent || MouseEvent;
    element.dispatchEvent(new EventCtor(type, { bubbles: true, cancelable: true }));
  }

  async function waitForShareUrl(timeout = 1800) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
      const found = findShareUrlInPage();
      if (found) return found;
      await wait(120);
    }
    return "";
  }

  async function resolveShareUrl() {
    let shareUrl = findShareUrlInPage();
    if (shareUrl) return shareUrl;

    const shareButton = findClickableByText([/分享/, /share/i]) || findDoubaoShareButtonByIcon();
    if (shareButton) {
      dispatchMouse(shareButton, "mouseover");
      dispatchMouse(shareButton, "mouseenter");
      shareButton.click();
      shareUrl = await waitForShareUrl(1800);
      if (shareUrl) return shareUrl;
    }

    const copyButton = findClickableByText([/复制链接/, /复制.*分享/, /copy.*link/i, /copy/i]);
    if (copyButton) {
      copyButton.click();
      shareUrl = await waitForShareUrl(1400);
      if (shareUrl) return shareUrl;
      shareUrl = await readClipboardShareUrl();
      if (shareUrl) return shareUrl;
      shareUrl = findShareUrlInPage();
      if (shareUrl) return shareUrl;
    }

    return "";
  }

  async function parseCapturedVids() {
    const vids = chatVideos.map((video) => video.vid).filter(Boolean);
    if (!vids.length) return null;
    const videos = [];
    const seen = new Set();
    for (const vid of vids) {
      if (!vid || seen.has(vid)) continue;
      seen.add(vid);
      try {
        videos.push(await resolveDoubaoVideoNoWatermark(vid));
      } catch (_) {
        const fallback = chatVideos.find((video) => video.vid === vid && video.url);
        if (fallback) videos.push(fallback);
      }
    }
    if (!videos.length) {
      throw new Error("未拿到官方无水印视频源，请确认该视频在当前登录账号的豆包空间中。");
    }
    return {
      success: true,
      type: "video",
      image_count: 0,
      video_count: videos.length,
      videos,
      video: videos[0]
    };
  }

  function mergeResults(primary, fallback) {
    const images = [...(primary?.images || []), ...(fallback?.images || [])];
    const videos = [...(primary?.videos || (primary?.video ? [primary.video] : [] ) || []), ...(fallback?.videos || (fallback?.video ? [fallback.video] : [] ) || [])];
    const dedupImages = [];
    const seenImages = new Set();
    for (const image of images) {
      if (!image?.url || seenImages.has(image.url)) continue;
      seenImages.add(image.url);
      dedupImages.push(image);
    }
    const dedupVideos = [];
    const seenVideos = new Set();
    for (const video of videos) {
      if (!video?.url || seenVideos.has(video.url)) continue;
      seenVideos.add(video.url);
      dedupVideos.push(video);
    }
    return {
      success: true,
      type: dedupImages.length && dedupVideos.length ? "mixed" : (dedupVideos.length ? "video" : "image"),
      image_count: dedupImages.length,
      video_count: dedupVideos.length,
      images: dedupImages,
      videos: dedupVideos,
      video: dedupVideos[0] || undefined
    };
  }

  function mediaItems(result) {
    const items = [];
    for (const image of result.images || []) {
      if (image?.url) items.push({ type: "image", url: image.url, width: image.width || 0, height: image.height || 0 });
    }
    for (const video of result.videos || (result.video ? [result.video] : [])) {
      if (video?.url) items.push({ type: "video", url: video.url, width: video.width || 0, height: video.height || 0, cover: video.cover || "" });
    }
    return items;
  }

  installShareLinkHooks();
  installShareLinkObserver();
  scanExistingPageState();
  rememberShareUrl(document.documentElement?.outerHTML || "");

  style();
  const root = document.createElement("div");
  root.id = ROOT_ID;
  root.innerHTML = `
    <div class="xiaobai-helper-panel" role="dialog" aria-label="小白素材解析工具">
      <div class="xiaobai-helper-head"><div class="xiaobai-helper-title">小白素材解析工具</div><button class="xiaobai-helper-close" type="button">×</button></div>
      <div class="xiaobai-helper-body"><div class="xiaobai-helper-status">点击右下角按钮解析当前页面。</div></div>
    </div>
    <button class="xiaobai-helper-button" type="button" title="解析当前页面素材">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7.5h16v6c0 3.1 0 4.7-1 5.7s-2.6 1-5.7 1h-2.6c-3.1 0-4.7 0-5.7-1s-1-2.6-1-5.7v-6Z" stroke="currentColor" stroke-width="1.7"/><path d="M4 7.5l.6-.8c1-1.4 1.6-2.1 2.3-2.5.7-.3 1.6-.3 3.2-.3h3.8c1.6 0 2.5 0 3.2.3.7.4 1.3 1.1 2.3 2.5l.6.8M12 10.5v6M9.5 14.2s1.8 2.3 2.5 2.3 2.5-2.3 2.5-2.3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
  `;
  document.documentElement.appendChild(root);

  const panel = root.querySelector(".xiaobai-helper-panel");
  const body = root.querySelector(".xiaobai-helper-body");

  function setStatus(text, isError = false) {
    body.innerHTML = `<div class="xiaobai-helper-status${isError ? " is-error" : ""}">${escapeHtml(text)}</div>`;
  }

  function renderResult(result) {
    const items = mediaItems(result);
    if (!items.length) {
      setStatus("没有解析到图片或视频。");
      return;
    }
    body.innerHTML = `<div class="xiaobai-helper-list"></div>`;
    const list = body.querySelector(".xiaobai-helper-list");
    items.forEach((item, index) => {
      const filename = `doubao-${item.type}-${index + 1}.${item.type === "video" ? "mp4" : "jpg"}`;
      const card = document.createElement("div");
      card.className = "xiaobai-helper-card";
      card.innerHTML = `
        ${item.type === "video" ? `<video src="${escapeHtml(item.url)}" poster="${escapeHtml(item.cover || "")}" controls preload="metadata"></video>` : `<img src="${escapeHtml(item.url)}" alt="解析图片 ${index + 1}" loading="lazy">`}
        <div class="xiaobai-helper-meta">${item.type === "video" ? "视频" : "图片"} ${index + 1}${item.width && item.height ? ` · ${item.width} × ${item.height}` : ""}</div>
        <div class="xiaobai-helper-actions"><a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">打开</a><button type="button" data-url="${escapeHtml(item.url)}" data-filename="${escapeHtml(filename)}">下载</button></div>
      `;
      list.appendChild(card);
    });
  }

  root.querySelector(".xiaobai-helper-button").addEventListener("click", async () => {
    panel.classList.add("is-open");
    setStatus("正在从当前页面捕获图片和视频...");
    try {
      scanExistingPageState();
      scanTextForMedia(document.documentElement?.outerHTML || "");

      let imageResult = directChatImageResult();
      if (chatVideos.length) {
        setStatus("正在通过豆包官方接口解析无水印视频...");
        const vidResult = await parseCapturedVids();
        renderResult(mergeResults(imageResult, vidResult));
        return;
      }

      if (imageResult) {
        renderResult(imageResult);
        return;
      }

      setStatus("正在尝试打开分享菜单以触发页面数据...");
      await resolveShareUrl();
      await wait(500);
      scanExistingPageState();
      scanTextForMedia(document.documentElement?.outerHTML || "");

      imageResult = directChatImageResult();
      if (chatVideos.length) {
        setStatus("正在通过豆包官方接口解析无水印视频...");
        const vidResult = await parseCapturedVids();
        renderResult(mergeResults(imageResult, vidResult));
        return;
      }
      if (imageResult) {
        renderResult(imageResult);
        return;
      }

      setStatus("未捕获到图片或视频，请滚动到目标消息，或先点击目标作品的分享/复制链接后再试。", true);
    } catch (error) {
      setStatus(humanMessage(error.message || error), true);
    }
  });

  root.querySelector(".xiaobai-helper-close").addEventListener("click", () => panel.classList.remove("is-open"));
  body.addEventListener("click", (event) => {
    const target = event.target.closest("button[data-url]");
    if (!target) return;
    GM_download({ url: target.dataset.url, name: target.dataset.filename });
  });
})();
