// Firebase Messaging service worker for Web Push notifications.
// Keep this file defensive: if Firebase CDN/config fails, SW registration must still succeed.

(function () {
  const firebaseConfig = {
    apiKey: "AIzaSyAVhzyoez3jTVt-4d9JatKjGv3bghP2Vyk",
    authDomain: "hillkoff-delivery.firebaseapp.com",
    projectId: "hillkoff-delivery",
    storageBucket: "hillkoff-delivery.firebasestorage.app",
    messagingSenderId: "396283391154",
    appId: "1:396283391154:web:8520157d6d9f1b7a31adab",
  };

  try {
    importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js");
    importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js");

    if (typeof firebase !== "undefined" && firebase.apps && firebase.apps.length === 0) {
      firebase.initializeApp(firebaseConfig);
    } else if (typeof firebase !== "undefined" && firebase.initializeApp) {
      firebase.initializeApp(firebaseConfig);
    }

    if (typeof firebase !== "undefined" && firebase.messaging) {
      const messaging = firebase.messaging();
      messaging.onBackgroundMessage(function (payload) {
        const data = payload && payload.data ? payload.data : {};
        const notification = payload && payload.notification ? payload.notification : {};
        const title = notification.title || data.title || "มีออเดอร์ใหม่";
        const body = notification.body || data.body || "มีออเดอร์ใหม่เข้ามา";

        self.registration.showNotification(title, {
          body,
          icon: "/icon-192.png",
          badge: "/icon-192.png",
          tag: data.orderId ? "new-order-" + data.orderId : "new-order",
          renotify: true,
          requireInteraction: true,
          data,
        });
      });
    }
  } catch (error) {
    // Do not throw: throwing here makes browser registration fail with
    // "ServiceWorker script evaluation failed".
    console.error("[firebase-messaging-sw] init failed", error);
  }

  self.addEventListener("notificationclick", function (event) {
    event.notification.close();
    event.waitUntil((async function () {
      const url = new URL("/", self.location.origin).href;
      const windows = await clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (client.url.indexOf(self.location.origin) === 0 && "focus" in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })());
  });
})();
