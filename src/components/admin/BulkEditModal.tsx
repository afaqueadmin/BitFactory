"use client";

import React, { useState } from "react";

interface Space {
  id: string;
  name: string;
  location: string;
}

interface BulkEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  minerCount: number;
  spaces: Space[];
  onSubmit: (updates: {
    spaceId?: string;
    rate_per_kwh?: number;
    status?: "ACTIVE" | "INACTIVE";
  }) => Promise<void>;
}

export function BulkEditModal({
  isOpen,
  onClose,
  minerCount,
  spaces,
  onSubmit,
}: BulkEditModalProps) {
  const [spaceId, setSpaceId] = useState<string>("");
  const [rate, setRate] = useState<string>("");
  const [status, setStatus] = useState<"ACTIVE" | "INACTIVE" | "">("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validate that at least one field is filled
    if (!spaceId && !rate && !status) {
      setError("Please select at least one field to update");
      return;
    }

    // Validate rate if provided
    if (rate) {
      const rateNum = Number(rate);
      if (isNaN(rateNum) || rateNum <= 0) {
        setError("Rate must be a positive number");
        return;
      }
    }

    try {
      setLoading(true);
      const updates: Record<string, unknown> = {};

      if (spaceId) updates.spaceId = spaceId;
      if (rate) updates.rate_per_kwh = Number(rate);
      if (status) updates.status = status;

      await onSubmit(updates);

      // Reset form
      setSpaceId("");
      setRate("");
      setStatus("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update miners");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Bulk Edit Miners</h2>

        <p className="text-gray-600 mb-6 text-sm">
          Updating {minerCount} miner{minerCount !== 1 ? "s" : ""}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Space Field */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Space (Optional)
            </label>
            <select
              value={spaceId}
              onChange={(e) => setSpaceId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select a space...</option>
              {spaces.map((space) => (
                <option key={space.id} value={space.id}>
                  {space.name}
                </option>
              ))}
            </select>
          </div>

          {/* Rate Field */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Rate per kWh (Optional)
            </label>
            <input
              type="number"
              step="0.000001"
              min="0"
              placeholder="e.g., 0.12"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {rate && (
              <p className="mt-1 text-xs text-gray-500">
                ${Number(rate).toFixed(6)}/kWh
              </p>
            )}
          </div>

          {/* Status Field */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Status (Optional)
            </label>
            <select
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as "ACTIVE" | "INACTIVE" | "")
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">No change</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Updating..." : "Update"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
