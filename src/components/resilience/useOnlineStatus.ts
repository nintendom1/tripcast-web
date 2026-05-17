import { useEffect, useState } from "react";

function readOnlineStatus() {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(readOnlineStatus);

  useEffect(() => {
    function handleOnlineStatusChange() {
      setIsOnline(readOnlineStatus());
    }

    window.addEventListener("online", handleOnlineStatusChange);
    window.addEventListener("offline", handleOnlineStatusChange);
    return () => {
      window.removeEventListener("online", handleOnlineStatusChange);
      window.removeEventListener("offline", handleOnlineStatusChange);
    };
  }, []);

  return isOnline;
}
