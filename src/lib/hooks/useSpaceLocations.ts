import { useState, useEffect } from "react";

/**
 * Fetches the distinct set of Mining Space locations, for use in
 * "Machine Hosting Location" dropdowns on invoice creation forms.
 */
export function useSpaceLocations() {
  const [locations, setLocations] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSpaceLocations = async () => {
      try {
        setLoading(true);
        const response = await fetch("/api/spaces");
        if (response.ok) {
          const data = await response.json();
          const spaces: Array<{ location: string }> = data.data || [];
          setLocations(
            Array.from(new Set(spaces.map((s) => s.location).filter(Boolean))),
          );
        }
      } catch (err) {
        console.error("Error fetching space locations:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchSpaceLocations();
  }, []);

  return { locations, loading };
}
