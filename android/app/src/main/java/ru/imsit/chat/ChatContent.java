package ru.imsit.chat;

import android.content.res.AssetManager;
import android.net.Uri;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.IOException;
import java.io.InputStream;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

final class ChatContent extends WebViewClient {
    private final AssetManager assets;
    private final ServerAddress server;
    private final Runnable openSettings;

    private final Runnable pageReady;

    ChatContent(AssetManager assets, ServerAddress server, Runnable openSettings, Runnable pageReady) {
        this.pageReady = pageReady;
        this.assets = assets;
        this.server = server;
        this.openSettings = openSettings;
    }

    @Override
    public void doUpdateVisitedHistory(WebView view, String url, boolean reload) {
        String route = Uri.parse(url).getFragment();
        if ("/dialogs".equals(route) || "/login".equals(route)) {
            CookieManager.getInstance().flush();
        }
    }

    @Override
    public void onPageFinished(WebView view, String url) {
        pageReady.run();
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        Uri target = request.getUrl();
        if (request.isForMainFrame() && request.hasGesture() && target.toString().equals("imsitchat://server")) {
            openSettings.run();
            return true;
        }
        return !server.contains(target) || !"/".equals(target.getEncodedPath());
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        Uri target = request.getUrl();
        String path = target.getEncodedPath();
        if (!server.contains(target) || path == null) return missing();
        if (!request.isForMainFrame() && path.startsWith("/api/")) return null;
        if (!request.getMethod().equals("GET")) return missing();

        boolean index = "/".equals(path);
        if (!index && (request.isForMainFrame() || !path.matches("/assets/[A-Za-z0-9_.-]+"))) return missing();
        try {
            InputStream stream = assets.open(index ? "index.html" : path.substring(1));
            Map<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", "no-store");
            headers.put("X-Content-Type-Options", "nosniff");
            String socketOrigin = server.origin.replaceFirst("^http", "ws");
            headers.put("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
                    + "connect-src 'self' " + socketOrigin + "; frame-src 'none'; object-src 'none'; base-uri 'none'");
            return new WebResourceResponse(index ? "text/html" : mime(path), index ? "UTF-8" : null,
                    200, "OK", headers, stream);
        } catch (IOException e) {
            return missing();
        }
    }

    private static String mime(String path) {
        if (path.endsWith(".js")) return "text/javascript";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".woff2")) return "font/woff2";
        if (path.endsWith(".woff")) return "font/woff";
        return "application/octet-stream";
    }

    private static WebResourceResponse missing() {
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
                Collections.emptyMap(), null);
    }
}
