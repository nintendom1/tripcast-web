import { ArrowLeft } from "lucide-react";

import { Button } from "../../components/ui/button";
import FollowerManagementPanel from "./FollowerManagementPanel";

type FollowerManagementPageProps = {
  token: string;
  onBack: () => void;
};

export default function FollowerManagementPage({ token, onBack }: FollowerManagementPageProps) {
  return (
    <div className="flex flex-col h-dvh bg-background">
      <header className="flex min-h-14 items-center gap-3 border-b px-4 py-2">
        <Button variant="ghost" size="sm" type="button" onClick={onBack} className="-ml-2">
          <ArrowLeft className="h-4 w-4 mr-1" aria-hidden />
          Back
        </Button>
        <h1 className="text-base font-semibold">Manage Followers</h1>
      </header>
      <div className="flex-1 overflow-y-auto p-4">
        <FollowerManagementPanel token={token} />
      </div>
    </div>
  );
}
