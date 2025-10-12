"use client";

import { useRouter } from "next/navigation";

export default function Dashboard() {
  const router = useRouter();

  const handleLogout = () => {
    // For now just redirect back to login
    // (you can replace this with proper auth/session clearing later)
    router.push("/");
  };

  return (
    <div className="min-h-screen bg-gray-100 pt-4">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white p-8 rounded-lg shadow-lg">
          <h1 className="text-3xl font-bold text-gray-800 mb-4">Dashboard</h1>
          <p className="text-gray-600 mb-6">
            Welcome to BitFactory! Your CryptoMiner Dashboard is ready.
          </p>

          {/* Dashboard Content */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-6 rounded-lg text-white">
              <h3 className="text-lg font-semibold mb-2">Mining Status</h3>
              <p className="text-2xl font-bold">Active</p>
            </div>
            <div className="bg-gradient-to-r from-green-500 to-green-600 p-6 rounded-lg text-white">
              <h3 className="text-lg font-semibold mb-2">Hash Rate</h3>
              <p className="text-2xl font-bold">125.4 MH/s</p>
            </div>
            <div className="bg-gradient-to-r from-yellow-500 to-yellow-600 p-6 rounded-lg text-white">
              <h3 className="text-lg font-semibold mb-2">Earnings</h3>
              <p className="text-2xl font-bold">$0.00</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
