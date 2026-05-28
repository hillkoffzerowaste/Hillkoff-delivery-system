/* eslint-disable no-undef */
// Firebase Messaging service worker for Web Push notifications.
// NOTE: Config values are safe to be public (web API key).

importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyAVhzyoez3jTVt-4d9JatKjGv3bghP2Vyk",
  authDomain: "hillkoff-delivery.firebaseapp.com",
  projectId: "hillkoff-delivery",
  storageBucket: "hillkoff-delivery.firebasestorage.app",
  messagingSenderId: "396283391154",
  appId: "1:396283391154:web:8520157d6d9f1b7a31adab",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload?.notification?.title || payload?.data?.title || "📦 มีออเดอร์ใหม่";
  const body = payload?.notification?.body || payload?.data?.body || "มีออเดอร์ใหม่เข้ามา";
  self.registration.showNotification(title, {
    body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: payload?.data || {},
  });
});

