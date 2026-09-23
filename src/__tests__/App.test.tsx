/**
 * App.test.tsx — Integration tests for the refactored App
 *
 * Tests:
 *   • App renders WelcomeOverlay on mount
 *   • Dashboard appears after clicking INITIALISE MISSION
 *   • Tab navigation works
 *   • SimulationTab renders config panel and viewport
 *   • OnboardingTour triggers on first visit
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import App from '../App';

// Mock heavy dependencies that don't work in jsdom
vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: any) => <div data-testid="canvas-mock">{children}</div>,
  useFrame: () => {},
}));
vi.mock('@react-three/drei', () => ({
  OrbitControls: () => null,
  Environment: () => null,
  Grid: () => null,
  Box: ({ children }: any) => <div>{children}</div>,
  Cylinder: ({ children }: any) => <div>{children}</div>,
  Float: ({ children }: any) => <div>{children}</div>,
}));
vi.mock('three', () => ({
  Group: class {},
  Quaternion: class { setFromUnitVectors() { return this; } },
  Vector3: class { normalize() { return this; } },
}));
vi.mock('@tensorflow/tfjs', () => ({
  sequential: () => ({ add: vi.fn(), dispose: vi.fn() }),
  layers: { dense: () => ({}) },
  tensor2d: () => ({ dataSync: () => new Float32Array(6) }),
  tidy: (fn: any) => fn(),
  io: { browserFiles: vi.fn(), fromMemory: vi.fn() },
  loadLayersModel: vi.fn(),
}));
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  LineChart: ({ children }: any) => <div>{children}</div>,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  CartesianGrid: () => null,
}));
vi.mock('driver.js', () => ({
  driver: () => ({ drive: vi.fn(), destroy: vi.fn() }),
}));
vi.mock('driver.js/dist/driver.css', () => ({}));
vi.mock('react-markdown', () => ({
  default: ({ children }: any) => <div>{children}</div>,
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, val: string) => { store[key] = val; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock matchMedia for useMediaQuery
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

describe('App — Integration Tests', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders WelcomeOverlay on mount', () => {
    render(<App />);
    expect(screen.getByText('INITIALISE MISSION')).toBeTruthy();
    expect(screen.getByRole('link',{name:'Log in / Sign up'}).getAttribute('href')).toBe('?view=account');
    // Both WelcomeOverlay and header render "COPTER STUDIO" text
    const copterTexts = screen.getAllByText(/COPTER/);
    expect(copterTexts.length).toBeGreaterThanOrEqual(1);
  });

  it('transitions to dashboard when INITIALISE MISSION is clicked', async () => {
    render(<App />);
    const btn = screen.getByText('INITIALISE MISSION');
    fireEvent.click(btn);

    // Advance past the 1200ms animation
    act(() => { vi.advanceTimersByTime(1500); });

    await waitFor(() => {
      expect(screen.queryByText('INITIALISE MISSION')).toBeNull();
      expect(screen.getByText('Simulation')).toBeTruthy();
    });
  });

  it('shows all 6 navigation tabs in the header', async () => {
    render(<App />);
    fireEvent.click(screen.getByText('INITIALISE MISSION'));
    act(() => { vi.advanceTimersByTime(1500); });

    await waitFor(() => {
      expect(screen.getByText('Simulation')).toBeTruthy();
      expect(screen.getByText('Benchmark')).toBeTruthy();
      expect(screen.getByText('Policy X-Ray')).toBeTruthy();
      expect(screen.getByText('Digital Twin')).toBeTruthy();
      expect(screen.getByText('Gym Bridge')).toBeTruthy();
      expect(screen.getByText('Leaderboard')).toBeTruthy();
    });
  });

  it('displays SYS_NOMINAL status indicator', async () => {
    render(<App />);
    fireEvent.click(screen.getByText('INITIALISE MISSION'));
    act(() => { vi.advanceTimersByTime(1500); });

    await waitFor(() => {
      expect(screen.getByText('SYS_NOMINAL')).toBeTruthy();
    });
  });

  it('shows Heuristic PD as default controller', async () => {
    render(<App />);
    fireEvent.click(screen.getByText('INITIALISE MISSION'));
    act(() => { vi.advanceTimersByTime(1500); });

    await waitFor(() => {
      expect(screen.getByText('Heuristic PD')).toBeTruthy();
    });
  });

  it('preserves Aether input, episode count and zero seed across navigation', async () => {
    render(<App />);
    fireEvent.click(screen.getByText('INITIALISE MISSION'));
    act(() => { vi.advanceTimersByTime(1500); });
    const input=screen.getByPlaceholderText(/Ask or say/);
    fireEvent.change(input,{target:{value:'Run a 2kg quad'}});
    fireEvent.click(screen.getByText('Benchmark'));
    expect((screen.getByLabelText('Benchmark episodes') as HTMLSelectElement).value).toBe('50');
    fireEvent.change(screen.getByLabelText('Benchmark episodes'),{target:{value:'10'}});
    fireEvent.change(screen.getByLabelText('Benchmark seed'),{target:{value:'0'}});
    expect(screen.getByText(/Cloud database is not connected/)).toBeTruthy();
    fireEvent.click(screen.getByText('Simulation'));
    expect((screen.getByPlaceholderText(/Ask or say/) as HTMLInputElement).value).toBe('Run a 2kg quad');
    fireEvent.click(screen.getByText('Benchmark'));
    expect((screen.getByLabelText('Benchmark episodes') as HTMLSelectElement).value).toBe('10');
    expect((screen.getByLabelText('Benchmark seed') as HTMLInputElement).value).toBe('0');
  });
});
