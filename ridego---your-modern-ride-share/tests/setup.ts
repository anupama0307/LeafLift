import '@testing-library/jest-dom';

// Mock localStorage
const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => { store[key] = value; },
        removeItem: (key: string) => { delete store[key]; },
        clear: () => { store = {}; },
        get length() { return Object.keys(store).length; },
        key: (index: number) => Object.keys(store)[index] ?? null,
    };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock sessionStorage
const sessionStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => { store[key] = value; },
        removeItem: (key: string) => { delete store[key]; },
        clear: () => { store = {}; },
        get length() { return Object.keys(store).length; },
        key: (index: number) => Object.keys(store)[index] ?? null,
    };
})();
Object.defineProperty(window, 'sessionStorage', { value: sessionStorageMock });

// Mock import.meta.env
Object.defineProperty(import.meta, 'env', {
    value: {
        VITE_API_BASE_URL: 'http://localhost:5001',
        VITE_FIREBASE_API_KEY: 'test-key',
        VITE_FIREBASE_AUTH_DOMAIN: 'test.firebaseapp.com',
        VITE_FIREBASE_PROJECT_ID: 'test-project',
        MODE: 'test',
    },
});

// Mock Material Icons (used throughout the app)
Object.defineProperty(document, 'fonts', {
    value: { ready: Promise.resolve() },
});
