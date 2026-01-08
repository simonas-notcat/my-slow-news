import { useNavigate } from "react-router-dom";

export function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="max-w-2xl mx-auto p-6 text-center">
      <div className="text-6xl mb-4">🔍</div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-2">
        Page Not Found
      </h1>
      <p className="text-gray-600 mb-6">
        The page you're looking for doesn't exist.
      </p>
      <button
        onClick={() => navigate("/claims")}
        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        Go to Claims List
      </button>
    </div>
  );
}
