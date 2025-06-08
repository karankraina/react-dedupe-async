# `use-async-data`

---

A powerful and flexible **React Hook** for managing asynchronous data, tackling common challenges like **race conditions**, **de-duplication** of API calls, and **global state synchronization**, all while keeping your components clean and efficient.

## Features

* **Race Condition Handling**: Ensures your UI always displays data from the latest request, preventing stale data from outdated promises.
* **Request De-duplication**: Automatically shares ongoing promises for the same data, preventing multiple identical requests from being initiated simultaneously.
* **Global State & Caching**: Caches fetched data in a shared in-memory store, allowing multiple components to consume the same data without re-fetching and ensuring they stay synchronized when data updates.
* **Dependency Tracking**: Re-fetches data automatically when specified dependencies change, just like `useEffect`.
* **Manual Refetching**: Provides a `refetch` function to imperatively trigger a data refresh.
* **Type-Safe**: Written in **TypeScript** for robust development and better code predictability.

---

## Installation

You can install `use-async-data` using npm or yarn:

```bash
npm install use-async-data
# or
yarn add use-async-data
```

---

## Usage

Here's how you can use `use-async-data` in your React components:

```typescript jsx
import React from 'react';
import useAsyncData from 'use-async-data'; // Adjust path if testing locally

// 1. Define your asynchronous function (e.g., an API call)
const fetchUserProfile = async (userId: number) => {
  console.log(`🚀 Fetching user profile for ID: \${userId}...`);
  // Simulate a network delay
  await new Promise(resolve => setTimeout(Math.random() * 2000 + 500, resolve));

  if (userId === 123) {
    return { id: userId, name: 'Alice', email: 'alice@example.com' };
  } else if (userId === 456) {
    return { id: userId, name: 'Bob', email: 'bob@example.com' };
  } else {
    // Simulate an error for non-existent users
    throw new Error(`User with ID \${userId} not found!`);
  }
};

interface User {
  id: number;
  name: string;
  email: string;
}

// 2. Create a component that uses the hook
const UserProfileDisplay: React.FC<{ userId: number }> = ({ userId }) => {
  // Use the hook!
  // - The first argument is your async function.
  // - The second is a dependency array (like useEffect's).
  // - The third (optional) is a unique 'cacheKey' for global state and de-duplication.
  const {
    data: user, // Rename 'data' to 'user' for clarity
    isLoading,
    error,
    refetch,
  } = useAsyncData<User>(
    () => fetchUserProfile(userId),
    [userId], // Re-fetch when userId changes
    `userProfile-\${userId}` // Cache data uniquely for each user ID
  );

  if (isLoading) {
    return <div style={{ color: 'blue' }}>Loading profile for user {userId}...</div>;
  }

  if (error) {
    return (
      <div style={{ color: 'red' }}>
        <p>Error: {error.message}</p>
        <button onClick={refetch}>Try Again</button>
      </div>
    );
  }

  if (!user) {
    return <div style={{ color: 'gray' }}>No user data available.</div>;
  }

  return (
    <div style={{ border: '1px solid #ccc', padding: '15px', margin: '10px', borderRadius: '8px' }}>
      <h3>User Profile (ID: {user.id})</h3>
      <p><strong>Name:</strong> {user.name}</p>
      <p><strong>Email:</strong> {user.email}</p>
      <button onClick={refetch}>Refetch Profile</button>
    </div>
  );
};

// 3. Demonstrate in an App component
const App: React.FC = () => {
  const [currentUserId, setCurrentUserId] = React.useState(123);

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', padding: '20px' }}>
      <h1>`use-async-data` Demo</h1>
      <p>This demonstrates how multiple components using the same `cacheKey` share data and avoid duplicate fetches.</p>
      <hr />

      <div style={{ marginBottom: '20px' }}>
        <button onClick={() => setCurrentUserId(123)} style={{ marginRight: '10px', padding: '8px 15px' }}>
          Load Alice (ID: 123)
        </button>
        <button onClick={() => setCurrentUserId(456)} style={{ marginRight: '10px', padding: '8px 15px' }}>
          Load Bob (ID: 456)
        </button>
        <button onClick={() => setCurrentUserId(789)} style={{ padding: '8px 15px' }}>
          Load Non-Existent (ID: 789)
        </button>
      </div>

      <h2>Component Instances:</h2>
      {/* Both instances below will share the same fetch and cached data */}
      <UserProfileDisplay userId={currentUserId} />
      <UserProfileDisplay userId={currentUserId} />

      {currentUserId === 123 && (
        <p style={{ marginTop: '20px', fontStyle: 'italic', color: '#555' }}>
          Notice how "Loading..." only appears once, and both components update simultaneously!
        </p>
      )}
    </div>
  );
};

export default App;
```

---

## API

### `useAsyncData<T>(asyncFunc, deps?, cacheKey?)`

#### Parameters

* `asyncFunc`: `() => Promise<T>`
    * **Required**. Your asynchronous function that returns a `Promise`. This is where you'd put your data fetching logic (e.g., an `axios` call, `fetch` request).
* `deps`: `React.DependencyList` (defaults to `[]`)
    * **Optional**. An array of dependencies. The `asyncFunc` will be re-executed if any value in this array changes (similar to `useEffect`'s dependency array).
* `cacheKey`: `string`
    * **Optional**. A unique string key for caching.
        * If provided, data fetched by this hook instance will be stored in a global in-memory cache under this key.
        * Components using the same `cacheKey` will share the same data, leading to de-duplication of requests and automatic synchronization.
        * If not provided, the data fetched by this specific hook instance will not be globally cached.

#### Returns

An object with the following properties:

* `data`: `T | null`
    * The data returned by your `asyncFunc` if the promise resolved successfully, otherwise `null`.
* `isLoading`: `boolean`
    * `true` if the data is currently being fetched, `false` otherwise.
* `error`: `Error | null`
    * An `Error` object if the `asyncFunc` promise rejected, otherwise `null`.
* `refetch`: `() => void`
    * A function you can call to manually re-initiate the `asyncFunc` and refresh the data. If a `cacheKey` is used, calling `refetch` will clear the current cache entry for that key, forcing a new fetch.

---

## How It Works

* **Race Condition Prevention**: Each data fetch is assigned a unique ID. When a promise resolves, its ID is checked against the latest active request ID. If they don't match, the older result is discarded, ensuring your UI always reflects the most recent request.
* **De-duplication**: When a `cacheKey` is provided, `use-async-data` checks a global in-memory cache. If a request for the same `cacheKey` is already in progress (`pending`), subsequent calls will simply await the existing promise rather than initiating a new one.
* **Global State & Synchronization**: The global `asyncDataCache` stores resolved data. When data for a `cacheKey` updates, all active `useAsyncData` instances subscribed to that `cacheKey` are notified and re-render with the fresh data. This provides a basic, efficient way to manage shared data across your application without complex state management libraries for simple fetching needs.

---

## Limitations & Considerations

* **Simple In-Memory Cache**: The built-in cache is a simple in-memory `Map`. It doesn't persist across page loads and doesn't have advanced features like garbage collection (LRU), stale-while-revalidate (SWR), or automatic revalidation on focus. For more complex caching strategies, consider dedicated libraries like [React Query](https://react-query-v3.tanstack.com/) or [SWR](https://swr.vercel.app/).
* **No SSR Support**: This hook is designed for client-side data fetching and does not natively support server-side rendering (SSR) data pre-fetching.
* **Error Handling**: Basic error handling is provided. For more specific error types or retry logic, you'll implement that within your `asyncFunc`.

---

## Contributing

Contributions are welcome! If you have suggestions, bug reports, or want to contribute code, please open an issue or pull request on the GitHub repository.

---

## Author

**Karan Raina** Email: [karanraina1996@gmail.com](mailto:karanraina1996@gmail.com)  
Twitter: [@karankraina](https://twitter.com/karankraina)

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
