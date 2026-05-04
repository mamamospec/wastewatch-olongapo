export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCCFr0bFvbLhAeaMk4314iczbY46Ej2EfM",
  authDomain: "wastewatch-olongapo-fina-fa6a8.firebaseapp.com",
  databaseURL: "https://wastewatch-olongapo-fina-fa6a8-default-rtdb.firebaseio.com",
  projectId: "wastewatch-olongapo-fina-fa6a8",
  storageBucket: "wastewatch-olongapo-fina-fa6a8.firebasestorage.app",
  messagingSenderId: "649765003460",
  appId: "1:649765003460:web:b75304593b144605c7a991"
};

export function hasFirebaseConfig() {
  const required = ["apiKey", "authDomain", "databaseURL", "projectId", "appId"];
  return required.every((key) => {
    const value = FIREBASE_CONFIG[key];
    return typeof value === "string" && value.trim().length > 0 && !value.includes("PASTE_");
  });
}
