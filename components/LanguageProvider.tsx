'use client';

import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';

import { apiFetch } from '@/lib/api/fetcher';
import { defaultServiceLanguage, ServiceLanguage } from '@/lib/i18n';

const STORAGE_KEY = 'service_language';

type LanguageContextValue = {
  language: ServiceLanguage;
  setLanguage: (lang: ServiceLanguage) => void;
};

const LanguageContext = createContext<LanguageContextValue>({
  language: defaultServiceLanguage,
  setLanguage: () => undefined
});

type ProfileLanguage = {
  service_language?: ServiceLanguage | null;
};

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<ServiceLanguage>(defaultServiceLanguage);

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (stored === 'ja' || stored === 'fr') {
      setLanguageState(stored);
    }

    let active = true;
    apiFetch<ProfileLanguage>('/api/me')
      .then((profile) => {
        if (!active) return;
        if (profile.service_language === 'ja' || profile.service_language === 'fr') {
          setLanguageState(profile.service_language);
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, language);
      document.documentElement.lang = language;
    }
  }, [language]);

  const value = useMemo(
    () => ({
      language,
      setLanguage: (next: ServiceLanguage) => setLanguageState(next)
    }),
    [language]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}
