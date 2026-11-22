package ru.imsit.chat;

import android.net.Uri;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;

/** A single HTTP(S) origin, shared by the packaged interface, REST and WebSocket. */
final class ServerAddress {
    static final String DEFAULT = "http://localhost:8080";
    final String origin;

    ServerAddress(String input) {
        try {
            URI url = new URI(input.trim());
            String scheme = url.getScheme();
            String host = url.getHost();
            int port = url.getPort();
            if (host == null || url.getRawUserInfo() != null || url.getRawQuery() != null
                    || url.getRawFragment() != null || !(url.getRawPath().isEmpty() || "/".equals(url.getRawPath()))
                    || port == 0 || port > 65535) {
                throw new IllegalArgumentException("Введите только адрес сервера, например http://192.168.1.10:8080");
            }
            host = host.toLowerCase(Locale.ROOT);
            boolean tls = "https".equalsIgnoreCase(scheme);
            if (!tls && !("http".equalsIgnoreCase(scheme) && isLocal(host))) {
                throw new IllegalArgumentException("Для HTTP укажите localhost или частный IPv4-адрес. Для другого сервера используйте HTTPS.");
            }
            boolean defaultPort = port == -1 || port == (tls ? 443 : 80);
            origin = (tls ? "https://" : "http://") + host + (defaultPort ? "" : ":" + port);
        } catch (URISyntaxException e) {
            throw new IllegalArgumentException("Проверьте адрес и порт сервера.");
        }
    }

    private static boolean isLocal(String host) {
        if (host.equals("localhost") || host.equals("[::1]")) return true;
        String[] parts = host.split("\\.", -1);
        if (parts.length != 4) return false;
        int[] octets = new int[4];
        for (int i = 0; i < parts.length; i++) {
            if (!parts[i].matches("0|[1-9][0-9]{0,2}")) return false;
            octets[i] = Integer.parseInt(parts[i]);
            if (octets[i] > 255) return false;
        }
        return octets[0] == 10 || octets[0] == 127 || (octets[0] == 192 && octets[1] == 168)
                || (octets[0] == 172 && octets[1] >= 16 && octets[1] <= 31);
    }

    boolean contains(Uri uri) {
        return origin.equals(uri.getScheme() + "://" + uri.getEncodedAuthority());
    }
}
