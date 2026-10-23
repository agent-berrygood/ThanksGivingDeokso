// Firebase 초기화 — 웹앱 설정값은 원래 공개되는 값이다 (접근 통제는 firestore.rules가 한다)
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, signInAnonymously, onAuthStateChanged, connectAuthEmulator,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, connectFirestoreEmulator,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

export * from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyCXPP0DccA8zWbpzmgFHjSRQiiOzyhj5_w',
  authDomain: 'thanksgiving-7cf77.firebaseapp.com',
  projectId: 'thanksgiving-7cf77',
  storageBucket: 'thanksgiving-7cf77.firebasestorage.app',
  messagingSenderId: '307384145453',
  appId: '1:307384145453:web:567d03a8501db35e244aa4',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// 로컬(에뮬레이터)에서 실행하면 실제 데이터 대신 에뮬레이터에 연결
const local = ['localhost', '127.0.0.1'].includes(location.hostname);
if (local) {
  connectAuthEmulator(auth, `http://${location.hostname}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, location.hostname, 8080);
}

// 익명 로그인 후 uid 반환
export function ready() {
  return new Promise((resolve, reject) => {
    const off = onAuthStateChanged(auth, (user) => {
      if (user) {
        off();
        resolve(user);
      }
    });
    signInAnonymously(auth).catch((e) => {
      off();
      reject(e);
    });
  });
}

export const params = new URLSearchParams(location.search);
