import React, { createContext, useContext, useState, useEffect } from 'react';
import en from '../i18n/en.json';
import hi from '../i18n/hi.json';

const AppContext = createContext(null);

const translations = {
  en,
  hi,
};

export function AppProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    return localStorage.getItem('civicledger_lang') || 'en';
  });

  const [textSize, setTextSizeState] = useState(() => {
    return localStorage.getItem('civicledger_textsize') || 'a';
  });

  const [highContrast, setHighContrastState] = useState(() => {
    return localStorage.getItem('civicledger_highcontrast') === 'true';
  });

  const [isLaunching, setIsLaunching] = useState(false);
  const [launchStep, setLaunchStep] = useState(0);

  // Ledger Verification State
  const [chainStatus, setChainStatus] = useState('idle'); // 'idle' | 'verifying' | 'valid' | 'broken'
  const [chainInfo, setChainInfo] = useState({ checked: 0, first_broken_sequence: null, reason: null });
  const [isTampered, setIsTampered] = useState(false);
  const [tamperedBlock, setTamperedBlock] = useState(null);

  const setLang = (newLang) => {
    setLangState(newLang);
    localStorage.setItem('civicledger_lang', newLang);
  };

  const setTextSize = (newSize) => {
    setTextSizeState(newSize);
    localStorage.setItem('civicledger_textsize', newSize);
  };

  const setHighContrast = (val) => {
    setHighContrastState(val);
    localStorage.setItem('civicledger_highcontrast', String(val));
  };

  // Sync with document element attributes for styling and accessibility
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    document.documentElement.classList.remove('text-size-a', 'text-size-aplus', 'text-size-aplusplus');
    document.documentElement.classList.add(`text-size-${textSize}`);
  }, [textSize]);

  useEffect(() => {
    if (highContrast) {
      document.documentElement.classList.add('high-contrast');
    } else {
      document.documentElement.classList.remove('high-contrast');
    }
  }, [highContrast]);

  const verifyLedgerChain = async () => {
    setChainStatus('verifying');
    try {
      const res = await fetch('/api/ledger/verify');
      const data = await res.json();
      setChainInfo(data);
      if (data.valid) {
        setChainStatus('valid');
        setIsTampered(false);
        setTamperedBlock(null);
        setTimeout(() => {
          setChainStatus('idle');
        }, 4000);
      } else {
        setChainStatus('broken');
        setIsTampered(true);
        setTamperedBlock(data.first_broken_sequence);
      }
      return data;
    } catch (err) {
      console.error('Failed to verify ledger chain:', err);
      setChainStatus('idle');
    }
  };

  const simulateTamper = async (seq = 5) => {
    try {
      const res = await fetch('/api/demo/tamper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sequence: seq }),
      });
      const data = await res.json();
      await verifyLedgerChain();
      return data;
    } catch (err) {
      console.error('Tamper simulation error:', err);
    }
  };

  const restoreChain = async () => {
    try {
      const res = await fetch('/api/demo/reset', { method: 'POST' });
      const data = await res.json();
      setIsTampered(false);
      setTamperedBlock(null);
      await verifyLedgerChain();
      return data;
    } catch (err) {
      console.error('Chain restore error:', err);
    }
  };

  const t = (path) => {
    const keys = path.split('.');
    let current = translations[lang] || translations.en;
    for (const key of keys) {
      if (current && current[key] !== undefined) {
        current = current[key];
      } else {
        // Fallback to English
        let fallback = translations.en;
        for (const fKey of keys) {
          if (fallback && fallback[fKey] !== undefined) {
            fallback = fallback[fKey];
          } else {
            return path;
          }
        }
        return fallback;
      }
    }
    return current;
  };

  return (
    <AppContext.Provider
      value={{
        lang,
        setLang,
        textSize,
        setTextSize,
        highContrast,
        setHighContrast,
        t,
        isLaunching,
        setIsLaunching,
        launchStep,
        setLaunchStep,
        chainStatus,
        chainInfo,
        isTampered,
        tamperedBlock,
        verifyLedgerChain,
        simulateTamper,
        restoreChain,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
