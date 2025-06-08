// src/index.ts
// (Your TypeScript useAsyncData hook code goes here, as provided previously)
import React, { useState, useEffect, useCallback, useRef } from 'react';

// Define the type for the data returned by the hook
interface UseAsyncDataResult<T> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

// Define the structure for a cached entry
interface CacheEntry<T> {
  promise: Promise<T> | null;
  status: 'idle' | 'pending' | 'resolved' | 'rejected';
  data: T | null;
  error: Error | null;
}

// A simple in-memory cache for de-duplication and potential global state
const asyncDataCache = new Map<string, CacheEntry<any>>();
const subscribers = new Map<string, Set<() => void>>(); // To notify components about cache updates

const notifySubscribers = (cacheKey: string) => {
  if (subscribers.has(cacheKey)) {
    subscribers.get(cacheKey)?.forEach(callback => callback());
  }
};

const subscribe = (cacheKey: string, callback: () => void) => {
  if (!subscribers.has(cacheKey)) {
    subscribers.set(cacheKey, new Set());
  }
  subscribers.get(cacheKey)?.add(callback);
};

const unsubscribe = (cacheKey: string, callback: () => void) => {
  if (subscribers.has(cacheKey)) {
    subscribers.get(cacheKey)?.delete(callback);
    if (subscribers.get(cacheKey)?.size === 0) {
      subscribers.delete(cacheKey);
    }
  }
};

/**
 * A React Hook for fetching asynchronous data with built-in handling for:
 * - Race conditions: Ensures only the latest request's data is returned.
 * - De-duplication: Prevents multiple identical requests from being initiated simultaneously.
 * - Global state: Caches data in a shared memory space, allowing multiple components
 * to access the same data without re-fetching, and automatically re-renders
 * components when the cached data changes.
 *
 * @template T The expected type of the data to be fetched.
 * @param {() => Promise<T>} asyncFunc The asynchronous function to execute (e.g., an API call).
 * This function should return a Promise of type T.
 * @param {React.DependencyList} [deps=[]] An array of dependencies. The asyncFunc will be re-executed
 * if any of these dependencies change. Similar to \`useEffect\` dependencies.
 * @param {string} [cacheKey] An optional string key for caching. If provided,
 * data fetched by this hook will be cached under this key. This enables
 * de-duplication and shared state across components using the same cacheKey.
 * If not provided, data is not cached globally for this specific instance.
 * @returns {UseAsyncDataResult<T>}
 * An object containing:
 * - \`data\`: The fetched data, or \`null\` if not yet fetched or an error occurred.
 * - \`isLoading\`: A boolean indicating if the data is currently being loaded.
 * - \`error\`: An Error object if the request failed, otherwise \`null\`.
 * - \`refetch\`: A function to manually re-initiate the data fetch.
 */
function useAsyncData<T>(
  asyncFunc: () => Promise<T>,
  deps: React.DependencyList = [],
  cacheKey?: string
): UseAsyncDataResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  // useRef to keep track of the latest active request ID to prevent race conditions
  const latestRequestId = useRef(0);

  // A ref to store the current status of the cache entry (if any)
  // This helps in de-duplication by knowing if a fetch is already in progress
  const cacheEntryStatus = useRef<CacheEntry<T>>({
    promise: null,
    status: 'idle',
    data: null,
    error: null,
  });

  // Function to fetch data, memoized to prevent unnecessary re-creations
  const fetchData = useCallback(async (currentRequestId: number) => {
    setIsLoading(true);
    setError(null);

    // If a cacheKey is provided, check the global cache for de-duplication
    if (cacheKey) {
      const cached = asyncDataCache.get(cacheKey) as CacheEntry<T> | undefined;
      if (cached && cached.status === 'pending' && cacheEntryStatus.current.promise === cached.promise) {
        // A request is already in progress for this cacheKey and it's *our* pending request
        // Do nothing, let the existing promise resolve
        return;
      }
      if (cached && cached.status === 'resolved') {
        // Data is already in cache and resolved, use it
        setData(cached.data);
        setIsLoading(false);
        setError(null);
        return;
      }
    }

    try {
      const requestPromise = asyncFunc();

      if (cacheKey) {
        // Store the promise in the global cache to de-duplicate subsequent calls
        const newCacheEntry: CacheEntry<T> = {
          promise: requestPromise,
          status: 'pending',
          data: null,
          error: null,
        };
        asyncDataCache.set(cacheKey, newCacheEntry);
        cacheEntryStatus.current = newCacheEntry;
      }

      const result = await requestPromise;

      // Race condition check: Only update state if this is the latest request
      if (currentRequestId === latestRequestId.current) {
        setData(result);
        setError(null);
        if (cacheKey) {
          const updatedCacheEntry: CacheEntry<T> = {
            promise: requestPromise,
            status: 'resolved',
            data: result,
            error: null,
          };
          asyncDataCache.set(cacheKey, updatedCacheEntry);
          cacheEntryStatus.current = updatedCacheEntry;
          notifySubscribers(cacheKey); // Notify other components using this cacheKey
        }
      }
    } catch (err: any) {
      // Race condition check for errors as well
      if (currentRequestId === latestRequestId.current) {
        const errorToSet = err instanceof Error ? err : new Error(String(err));
        setError(errorToSet);
        setData(null);
        if (cacheKey) {
          const updatedCacheEntry: CacheEntry<T> = {
            promise: null, // Clear promise on error for re-attempt
            status: 'rejected',
            data: null,
            error: errorToSet,
          };
          asyncDataCache.set(cacheKey, updatedCacheEntry);
          cacheEntryStatus.current = updatedCacheEntry;
          notifySubscribers(cacheKey);
        }
      }
    } finally {
      // Only set isLoading to false if this was the latest request
      if (currentRequestId === latestRequestId.current) {
        setIsLoading(false);
      }
    }
  }, [asyncFunc, cacheKey]); // Include cacheKey in deps of fetchData

  // Effect to trigger data fetching
  useEffect(() => {
    let cleanupCalled = false; // To prevent setting state on unmounted components

    const initializeFetch = async () => {
      // Increment request ID for each new fetch, preventing race conditions
      const currentRequestId = ++latestRequestId.current;

      if (cacheKey) {
        const cached = asyncDataCache.get(cacheKey) as CacheEntry<T> | undefined;
        if (cached && cached.status === 'resolved') {
          // If data is already in cache, use it immediately
          if (!cleanupCalled) {
            setData(cached.data);
            setIsLoading(false);
            setError(null);
          }
        } else if (cached && cached.status === 'pending' && cacheEntryStatus.current.promise === cached.promise) {
          // If a fetch is already in progress for this cacheKey and it's the one initiated by *this* hook instance,
          // then we attach to its promise.
          setIsLoading(true);
          try {
            const result = await (cached.promise as Promise<T>); // Cast to Promise<T> since status is 'pending'
            if (!cleanupCalled && currentRequestId === latestRequestId.current) {
              setData(result);
              setError(null);
            }
          } catch (err: any) {
            if (!cleanupCalled && currentRequestId === latestRequestId.current) {
              const errorToSet = err instanceof Error ? err : new Error(String(err));
              setError(errorToSet);
              setData(null);
            }
          } finally {
            if (!cleanupCalled && currentRequestId === latestRequestId.current) {
              setIsLoading(false);
            }
          }
        } else {
          // No valid cached data, or the cached data is from a different hook instance's pending request.
          // Initiate a new fetch.
          fetchData(currentRequestId);
        }
      } else {
        // No cacheKey provided, always fetch
        fetchData(currentRequestId);
      }
    };

    initializeFetch();

    // If cacheKey is provided, subscribe to changes in the global cache
    const handleCacheUpdate = () => {
      if (!cleanupCalled) {
        const cached = asyncDataCache.get(cacheKey as string) as CacheEntry<T> | undefined;
        if (cached) {
          if (cached.status === 'resolved') {
            setData(cached.data);
            setIsLoading(false);
            setError(null);
          } else if (cached.status === 'rejected') {
            setError(cached.error);
            setData(null);
            setIsLoading(false);
          }
        }
      }
    };

    if (cacheKey) {
      subscribe(cacheKey, handleCacheUpdate);
    }

    return () => {
      cleanupCalled = true;
      // When the component unmounts or dependencies change,
      // invalidate previous requests to prevent race conditions.
      // By incrementing latestRequestId, we ensure any ongoing
      // requests from this particular effect run will be ignored.
      latestRequestId.current++;
      if (cacheKey) {
        unsubscribe(cacheKey, handleCacheUpdate);
      }
    };
  }, [...deps, fetchData]); // Add fetchData to deps to ensure re-run if it changes (due to asyncFunc or cacheKey)

  // Refetch function to manually trigger a data fetch
  const refetch = useCallback(() => {
    const currentRequestId = ++latestRequestId.current; // Generate a new ID for refetch
    // Clear existing cache entry for this key if a refetch is explicitly called.
    // This ensures a fresh fetch even if data was previously cached as 'resolved'.
    if (cacheKey) {
      asyncDataCache.delete(cacheKey);
      cacheEntryStatus.current = {
        promise: null,
        status: 'idle',
        data: null,
        error: null,
      };
    }
    fetchData(currentRequestId);
  }, [fetchData, cacheKey]);

  return { data, isLoading, error, refetch };
}

export default useAsyncData;