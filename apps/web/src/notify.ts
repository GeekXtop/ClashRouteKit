import { useEffect } from "react";
import { App } from "antd";

interface NotifyApi {
  error: (content: string) => void;
  success: (content: string) => void;
}

let api: NotifyApi | null = null;

export function setNotifyApi(next: NotifyApi | null): void {
  api = next;
}

export function notifyError(content: string): void {
  api?.error(content);
}

export function notifySuccess(content: string): void {
  api?.success(content);
}

export function NotifyBridge(): null {
  const { message } = App.useApp();
  useEffect(() => {
    setNotifyApi({
      error: (content) => void message.error(content),
      success: (content) => void message.success(content),
    });
    return () => setNotifyApi(null);
  }, [message]);
  return null;
}
