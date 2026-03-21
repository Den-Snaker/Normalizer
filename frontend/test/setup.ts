import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock import.meta.env
vi.stubGlobal('import.meta', {
  env: {
    VITE_GEMINI_API_KEY: 'test-gemini-key',
    VITE_OPENROUTER_API_KEY: 'test-openrouter-key',
    VITE_OLLAMA_CLOUD_API_KEY: 'test-ollama-key',
    VITE_API_URL: 'http://localhost:8000'
  }
});

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  clear: vi.fn(),
  removeItem: vi.fn(),
  length: 0,
  key: vi.fn()
};
vi.stubGlobal('localStorage', localStorageMock);

// Mock indexedDB
const indexedDBMock = {
  open: vi.fn(),
  deleteDatabase: vi.fn()
};
vi.stubGlobal('indexedDB', indexedDBMock);

// Mock fetch
global.fetch = vi.fn();

// Mock FileReader
class FileReaderMock {
  onload: ((e: ProgressEvent<FileReader>) => void) | null = null;
  onerror: ((e: ProgressEvent<FileReader>) => void) | null = null;
  result: string | ArrayBuffer | null = null;
  
  readAsDataURL(file: File) {
    this.result = 'data:application/pdf;base64,dGVzdA==';
    if (this.onload) {
      this.onload({ target: this } as ProgressEvent<FileReader>);
    }
  }
  
  readAsText(file: File) {
    this.result = 'test content';
    if (this.onload) {
      this.onload({ target: this } as ProgressEvent<FileReader>);
    }
  }
}
vi.stubGlobal('FileReader', FileReaderMock);