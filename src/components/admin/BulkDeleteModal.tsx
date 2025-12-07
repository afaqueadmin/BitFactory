"use client";

import React, { useState } from "react";

interface Miner {
  id: string;
  name: string;
  hardwareName?: string;
  spaceName?: string;
}

interface BulkDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  minerCount: number;
  minersPreview: Miner[];
  onSubmit: () => Promise<void>;
}

export function BulkDeleteModal({
  isOpen,
  onClose,
  minerCount,
  minersPreview,
  onSubmit,
}: BulkDeleteModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const handleConfirm = async () => {
    try {
      setLoading(true);
      setError("");
      await onSubmit();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete miners");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const remainingCount = Math.max(0, minerCount - 10);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4 text-red-600">
          Delete {minerCount} Miner{minerCount !== 1 ? "s" : ""}?
        </h2>

        <p className="text-gray-600 mb-4 text-sm">
          This action cannot be undone. The following miners will be deleted:
        </p>

        {/* Miners Preview */}
        <div className="bg-gray-50 border border-gray-200 rounded p-3 mb-4 max-h-48 overflow-y-auto">
          <ul className="space-y-2 text-sm">
            {minersPreview.map((miner) => (
              <li
                key={miner.id}
                className="text-gray-700 border-b border-gray-200 pb-1 last:border-b-0"
              >
                <span className="font-medium">{miner.name}</span>
                {miner.spaceName && (
                  <span className="text-gray-500 ml-2">
                    ({miner.spaceName})
                  </span>
                )}
              </li>
            ))}
          </ul>

          {remainingCount > 0 && (
            <p className="text-gray-500 text-xs mt-2 pt-2 border-t border-gray-200">
              ... and {remainingCount} more miner
              {remainingCount !== 1 ? "s" : ""}
            </p>
          )}
        </div>

        {/* Warning */}
        <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mb-4">
          <p className="text-xs text-yellow-800">
            <strong>⚠️ Warning:</strong> Deleting miners will free up hardware
            units and remove all associated data including rate history.
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4 text-sm">
            {error}
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 px-4 py-2 text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {loading ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
