'use client';
import { useEffect } from 'react';
import { onIdTokenChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

export default function AuthSync() {
  useEffect(() => {
    return onIdTokenChanged(auth, async (user) => {
      if (user) {
        const token = await user.getIdToken();
        sessionStorage.setItem('firebaseIdToken', token);
      } else {
        sessionStorage.removeItem('firebaseIdToken');
        sessionStorage.removeItem('role');
      }
    });
  }, []);

  return null;
}
