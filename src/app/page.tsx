export default function Home() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white">
      <div className="text-center space-y-6">
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
          🚧 Work in Progress
        </h1>
        <p className="text-gray-300 text-lg max-w-md mx-auto">
          Our CryptoMiner Dashboard is under construction. Stay tuned for
          something amazing!
        </p>
        <a
          href="/login"
          className="inline-block px-6 py-3 rounded-lg bg-yellow-500 text-black font-semibold text-lg shadow-lg hover:bg-yellow-400 transition-colors"
        >
          Login
        </a>
      </div>
    </div>
  );
}
