package org.asafonov.monly;

import android.content.Intent;
import android.net.Uri;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import android.os.Environment;

class MyWebViewClient extends WebViewClient {

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, String url) {
        if (url.startsWith("json://")) {
            try {
                File path = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                File file = new File(path, "monly_backup.json");
                if (! path.exists()) path.mkdirs();
                if (! file.exists()) file.createNewFile();
                String data = url.substring(7);
                OutputStream os = new FileOutputStream(file);
                os.write(data.getBytes());
                os.close();
                url = "https://google.com/search?q=" + Environment.DIRECTORY_DOWNLOADS;
            } catch (Exception e) {
                url = "https://google.com/search?q=" + e.getMessage();
            }
        }

        view.loadUrl(url);

        return true;
    }
}
