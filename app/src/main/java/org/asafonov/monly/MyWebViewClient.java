package org.asafonov.monly;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.util.Log;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.widget.Toast;

class MyWebViewClient extends WebViewClient {

    private static final String TAG = "MyWebViewClient";

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        Uri uri = request.getUrl();
        if (uri == null) {
            return false;
        }

        String scheme = uri.getScheme();
        if (scheme != null && scheme.equalsIgnoreCase("https")) {
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                view.getContext().startActivity(intent);
            } catch (ActivityNotFoundException e) {
                Log.w(TAG, "No app to open " + uri, e);
                Toast.makeText(view.getContext(),
                        "No app to open this link",
                        Toast.LENGTH_LONG).show();
            }
            return true;
        }

        view.loadUrl(uri.toString());
        return true;
    }
}
