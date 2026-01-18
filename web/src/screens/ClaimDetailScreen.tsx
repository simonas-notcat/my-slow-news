import { useParams } from "react-router-dom";
import { ClaimDetail } from "../components/ClaimDetail";

export function ClaimDetailScreen() {
  const { id } = useParams<{ id: string }>();

  if (!id) {
    return (
      <div className="max-w-2xl mx-auto p-6 text-center">
        <p className="text-red-600">Invalid claim ID</p>
      </div>
    );
  }

  return <ClaimDetail />;
}
