import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { registerSW } from "virtual:pwa-register";

export type PwaUpdatePhase = "idle" | "checking" | "current" | "available" | "updating" | "reloading" | "restart" | "error";

interface PwaUpdateValue {
  phase: PwaUpdatePhase;
  error: string;
  checkForUpdate: () => Promise<void>;
  applyUpdate: () => Promise<void>;
}

const PwaUpdateContext = createContext<PwaUpdateValue | null>(null);

function waitForInstall(worker: ServiceWorker) {
  if (["installed", "activated", "redundant"].includes(worker.state)) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    const timer = window.setTimeout(() => finish(false), 15_000);
    const finish = (result: boolean) => {
      window.clearTimeout(timer);
      worker.removeEventListener("statechange", changed);
      resolve(result);
    };
    const changed = () => {
      if (["installed", "activated", "redundant"].includes(worker.state)) finish(true);
    };
    worker.addEventListener("statechange", changed);
  });
}

export function PwaUpdateProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<PwaUpdatePhase>("idle");
  const [error, setError] = useState("");
  const registrationRef = useRef<ServiceWorkerRegistration | undefined>(undefined);
  const updateServiceWorkerRef = useRef<() => Promise<void>>(async () => undefined);
  const reloadTimerRef = useRef<number | undefined>(undefined);

  const reloadPage = useCallback(() => {
    if (reloadTimerRef.current) return;
    setPhase("reloading");
    setError("");
    reloadTimerRef.current = window.setTimeout(() => window.location.reload(), 500);
  }, []);

  useEffect(() => {
    updateServiceWorkerRef.current = registerSW({
      immediate: true,
      onNeedRefresh: () => { setPhase("available"); setError(""); },
      onNeedReload: reloadPage,
      onRegisteredSW: (_, registration) => { registrationRef.current = registration; },
      onRegisterError: () => { setPhase("error"); setError("版本服务暂时不可用，请稍后再试。"); },
    });
    return () => window.clearTimeout(reloadTimerRef.current);
  }, [reloadPage]);

  const getRegistration = useCallback(async () => {
    if (!("serviceWorker" in navigator)) return undefined;
    const registration = registrationRef.current ?? await navigator.serviceWorker.getRegistration();
    registrationRef.current = registration;
    return registration;
  }, []);

  const checkForUpdate = useCallback(async () => {
    if (!navigator.onLine) { setPhase("error"); setError("当前处于离线状态，联网后再检查。"); return; }
    setPhase("checking"); setError("");
    try {
      const registration = await getRegistration();
      if (!registration) throw new Error("当前浏览器不支持应用更新。");
      await registration.update();
      const finished = registration.installing ? await waitForInstall(registration.installing) : true;
      await new Promise((resolve) => window.setTimeout(resolve, 150));
      if (!navigator.serviceWorker.controller && registration.active) reloadPage();
      else if (registration.waiting) setPhase("available");
      else if (finished) setPhase("current");
      else { setPhase("error"); setError("新版本仍在后台下载，准备好后会自动提醒你。"); }
    } catch (reason) {
      setPhase("error");
      setError(reason instanceof Error ? reason.message : "检查失败，请稍后再试。");
    }
  }, [getRegistration, reloadPage]);

  const applyUpdate = useCallback(async () => {
    if (!navigator.onLine) { setPhase("error"); setError("当前处于离线状态，联网后再更新。"); return; }
    setPhase("updating"); setError("");
    try {
      const registration = await getRegistration();
      if (!registration) throw new Error("当前浏览器不支持应用更新。");
      if (!registration.waiting) {
        await registration.update();
        if (registration.installing) await waitForInstall(registration.installing);
      }
      if (!registration.waiting) { setPhase("current"); return; }
      const changed = new Promise<boolean>((resolve) => {
        const timer = window.setTimeout(() => finish(false), 6_000);
        const finish = (result: boolean) => {
          window.clearTimeout(timer);
          navigator.serviceWorker.removeEventListener("controllerchange", controlled);
          resolve(result);
        };
        const controlled = () => finish(true);
        navigator.serviceWorker.addEventListener("controllerchange", controlled);
      });
      await updateServiceWorkerRef.current();
      if (await changed) reloadPage();
      else setPhase("restart");
    } catch (reason) {
      setPhase("error");
      setError(reason instanceof Error ? reason.message : "更新失败，请稍后再试。");
    }
  }, [getRegistration, reloadPage]);

  return <PwaUpdateContext.Provider value={{ phase, error, checkForUpdate, applyUpdate }}>{children}</PwaUpdateContext.Provider>;
}

export function usePwaUpdate() {
  const value = useContext(PwaUpdateContext);
  if (!value) throw new Error("usePwaUpdate must be used inside PwaUpdateProvider");
  return value;
}
