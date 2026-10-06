import { PropsWithChildren, useEffect } from "react";
import Taro from "@tarojs/taro";
import { hasMiniToken } from "./services/auth";
import "./app.scss";

export default function App({ children }: PropsWithChildren) {
  useEffect(() => {
    if (!hasMiniToken()) Taro.reLaunch({ url: "/pages/auth/index" });
  }, []);
  return children;
}
