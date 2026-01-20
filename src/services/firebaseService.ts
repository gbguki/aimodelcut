// src/services/firebaseService.ts
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs } from "firebase/firestore";
import { Workspace } from "../types";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// 🔹 프로젝트 저장
export async function saveProject(project: Workspace) {
  try {
    await addDoc(collection(db, "projects"), project);
  } catch (error) {
    console.error("Error saving project:", error);
    throw error;
  }
}

// 🔹 프로젝트 불러오기
export async function fetchProjects(): Promise<Workspace[]> {
  try {
    const snapshot = await getDocs(collection(db, "projects"));
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Workspace));
  } catch (error) {
    console.error("Error fetching projects:", error);
    throw error;
  }
}

// 호환성을 위해 기존 함수명도 유지
export const saveProjectToCloud = saveProject;
export const fetchProjectsFromCloud = fetchProjects;
