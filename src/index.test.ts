import { renderHook, act, waitFor } from '@testing-library/react';
import useAsyncData from './index'; // Adjust import path as needed

// Mock a simple async function
const mockFetch = jest.fn((value: string) =>
  new Promise(resolve => setTimeout(() => resolve(`Data: ${value}`), 100))
);

const mockFetchError = jest.fn(() =>
  new Promise((_, reject) => setTimeout(() => reject(new Error('Failed to fetch')), 100))
);

describe('useAsyncData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return initial loading state', () => {
    const { result } = renderHook(() => useAsyncData(mockFetch));
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('should fetch data successfully', async () => {
    const { result } = renderHook(() => useAsyncData(() => mockFetch('test')));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toBe('Data: test');
    expect(result.current.error).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should handle errors', async () => {
    const { result } = renderHook(() => useAsyncData(mockFetchError));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('Failed to fetch');
    expect(mockFetchError).toHaveBeenCalledTimes(1);
  });

  it('should handle race conditions (only latest data)', async () => {
    let resolveFirst: (value: any) => void;
    let resolveSecond: (value: any) => void;

    const slowFetch = jest.fn(() => new Promise(resolve => { resolveFirst = resolve; }));
    const fastFetch = jest.fn(() => new Promise(resolve => { resolveSecond = resolve; }));

    const { result, rerender } = renderHook(() => useAsyncData(slowFetch));

    // First call (slow)
    act(() => {
      // Simulate another call with different asyncFunc (or deps change)
      rerender(() => useAsyncData(fastFetch));
    });

    // Resolve fast fetch first
    act(() => {
      resolveSecond('Fast Data');
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBe('Fast Data'); // Should be 'Fast Data'

    // Resolve slow fetch later
    act(() => {
      resolveFirst('Slow Data');
    });

    // Data should remain 'Fast Data' because the slow fetch's result was ignored
    expect(result.current.data).toBe('Fast Data');
  });

  it('should de-duplicate requests with the same cacheKey', async () => {
    const fetchWithCacheKey = jest.fn(() => new Promise(resolve => setTimeout(() => resolve('Cached Data'), 100)));

    const { result: hook1 } = renderHook(() => useAsyncData(fetchWithCacheKey, [], 'my-cache-key'));
    const { result: hook2 } = renderHook(() => useAsyncData(fetchWithCacheKey, [], 'my-cache-key'));

    expect(hook1.current.isLoading).toBe(true);
    expect(hook2.current.isLoading).toBe(true);
    expect(fetchWithCacheKey).toHaveBeenCalledTimes(1); // Only one fetch initiated

    await waitFor(() => expect(hook1.current.isLoading).toBe(false));
    expect(hook1.current.data).toBe('Cached Data');
    expect(hook2.current.data).toBe('Cached Data'); // Both hooks get the same data

    expect(fetchWithCacheKey).toHaveBeenCalledTimes(1); // Still only one fetch
  });

  it('should refetch data when refetch is called', async () => {
    let callCount = 0;
    const refetchableMock = jest.fn(() =>
      new Promise(resolve => setTimeout(() => {
        callCount++;
        resolve(`Data ${callCount}`);
      }, 50))
    );

    const { result } = renderHook(() => useAsyncData(refetchableMock));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBe('Data 1');
    expect(refetchableMock).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.refetch();
    });

    expect(result.current.isLoading).toBe(true); // Should go back to loading state
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBe('Data 2');
    expect(refetchableMock).toHaveBeenCalledTimes(2);
  });

  it('should notify subscribers on cache update', async () => {
    const initialFetch = jest.fn(() => new Promise(resolve => setTimeout(() => resolve('Initial'), 50)));
    const updatedFetch = jest.fn(() => new Promise(resolve => setTimeout(() => resolve('Updated'), 50)));

    const { result: hook1 } = renderHook(() => useAsyncData(initialFetch, [], 'global-key'));
    const { result: hook2, rerender } = renderHook(() => useAsyncData(initialFetch, [], 'global-key'));

    await waitFor(() => expect(hook1.current.isLoading).toBe(false));
    expect(hook1.current.data).toBe('Initial');
    expect(hook2.current.data).toBe('Initial');

    act(() => {
      // Simulate another hook instance or manual refetch triggering an update
      // For testing, we'll use a third renderHook call that forces a fetch
      const { result: hook3 } = renderHook(() => useAsyncData(updatedFetch, [], 'global-key'));
      act(() => {
        hook3.current.refetch(); // This will trigger a new fetch and update the cache
      });
    });

    await waitFor(() => expect(hook1.current.isLoading).toBe(false)); // Wait for global update to settle
    expect(hook1.current.data).toBe('Updated');
    expect(hook2.current.data).toBe('Updated');
  });

  it('should not update state if component unmounts during fetch', async () => {
    const longRunningFetch = jest.fn(() => new Promise(resolve => setTimeout(() => resolve('Long Data'), 500)));

    const { result, unmount } = renderHook(() => useAsyncData(longRunningFetch));

    expect(result.current.isLoading).toBe(true);
    unmount(); // Unmount the component before the promise resolves

    // Wait for the promise to resolve (but it won't update state)
    await new Promise(resolve => setTimeout(600, resolve));

    // Assert that state was not updated (remains initial values)
    expect(result.current.data).toBeNull();
    // isLoading might still be true if the unmount happens very fast, but typically we ensure it doesn't cause errors
    // The key is that it doesn't cause "Cannot update a component (XYZ) while rendering a different component (ABC)"
    // or set data on an unmounted component.
    // We can't strictly assert isLoading is false here as the unmount happens immediately.
    // The main point is that no error is thrown and data remains null.
  });
});