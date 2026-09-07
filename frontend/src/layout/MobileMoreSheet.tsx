import { useEffect, useRef, useState, type FormEvent } from "react";
import { NavLink } from "react-router-dom";
import { DeviceMobileIcon } from "@phosphor-icons/react/DeviceMobile";
import { KeyIcon } from "@phosphor-icons/react/Key";
import { MoonIcon } from "@phosphor-icons/react/Moon";
import { SunIcon } from "@phosphor-icons/react/Sun";
import { XIcon } from "@phosphor-icons/react/X";

import { hasAccessToken, saveAccessToken } from "../api/client";
import { usePwaInstall } from "../contexts/PwaInstallContext";
import { useTheme } from "../contexts/ThemeContext";

interface MobileMoreSheetProps {
  open: boolean;
  reviewEnabled: boolean;
  onClose: () => void;
}

export function MobileMoreSheet({ open, reviewEnabled, onClose }: MobileMoreSheetProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const { canOfferInstall, closeIosGuide, dismissIosGuide, isIosGuideOpen, requestInstall } = usePwaInstall();
  const { theme, toggleTheme } = useTheme();
  const [accessCodeOpen, setAccessCodeOpen] = useState(false);
  const [accessCode, setAccessCode] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function closeSheet() {
    closeIosGuide();
    setAccessCodeOpen(false);
    onClose();
  }

  function handleAccessCodeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveAccessToken(accessCode);
    setAccessCode("");
    setAccessCodeOpen(false);
  }

  return (
    <dialog className="mobile-more-sheet" ref={dialogRef} onCancel={closeSheet} aria-labelledby="mobile-more-title">
      <div className="mobile-sheet-body">
        <header className="mobile-sheet-header"><h2 id="mobile-more-title">我的</h2><button className="mobile-sheet-close" aria-label="关闭我的菜单" onClick={closeSheet} type="button"><XIcon aria-hidden="true" size={20} weight="bold" /></button></header>
        {isIosGuideOpen ? <section className="ios-install-guide" aria-labelledby="ios-install-title"><h3 id="ios-install-title">添加到主屏幕</h3><ol><li>在 Safari 点按“分享”。</li><li>选择“添加到主屏幕”。</li><li>确认“添加”，即可独立打开。</li></ol><div className="mobile-sheet-actions"><button className="button button-secondary" onClick={dismissIosGuide} type="button">七天后再提示</button><button className="button button-primary" onClick={closeIosGuide} type="button">知道了</button></div></section> : <><div className="mobile-sheet-list"><NavLink to="/write" onClick={closeSheet}><span>写学习日记</span><small>记录今天的输入和复盘</small></NavLink><NavLink to="/history" onClick={closeSheet}><span>日记历史</span><small>回看、搜索和继续整理日记</small></NavLink><NavLink to="/algorithms/history" onClick={closeSheet}><span>算法历史</span><small>查看多次尝试和继续中的训练</small></NavLink><NavLink to="/interview/history" onClick={closeSheet}><span>八股历史</span><small>继续、重练或查看记录</small></NavLink><NavLink to="/algorithms/review" onClick={closeSheet}><span>算法复习</span><small>处理到期题目和薄弱点</small></NavLink><NavLink to="/algorithms/settings" onClick={closeSheet}><span>算法设置</span><small>配置每日推荐和临时训练</small></NavLink><NavLink to="/settings/desktop-pet" onClick={closeSheet}><span>桌宠设置</span><small>配置天气、里程碑和提醒</small></NavLink>{reviewEnabled ? <NavLink to="/interview/review" onClick={closeSheet}><span>题库审核</span><small>管理训练题与后台任务</small></NavLink> : null}<button onClick={toggleTheme} type="button"><span>{theme === "editorial" ? "切换深色主题" : "切换到编辑浅色主题"}</span>{theme === "editorial" ? <MoonIcon aria-hidden="true" size={20} weight="bold" /> : <SunIcon aria-hidden="true" size={20} weight="bold" />}</button>{canOfferInstall ? <button onClick={() => void requestInstall()} type="button"><span>安装到手机</span><DeviceMobileIcon aria-hidden="true" size={20} weight="bold" /></button> : null}<button onClick={() => setAccessCodeOpen((value) => !value)} type="button"><span>{hasAccessToken() ? "更新访问码" : "输入访问码"}</span><KeyIcon aria-hidden="true" size={20} weight="bold" /></button></div>{accessCodeOpen ? <form className="access-code-form" onSubmit={handleAccessCodeSubmit}><label><span>访问码</span><input autoComplete="current-password" autoFocus onChange={(event) => setAccessCode(event.target.value)} placeholder="仅保存到本次浏览会话" type="password" value={accessCode} /></label><div className="mobile-sheet-actions"><button className="button button-secondary" onClick={() => { saveAccessToken(""); setAccessCodeOpen(false); }} type="button">清除</button><button className="button button-primary" type="submit">保存</button></div></form> : null}</>}
      </div>
    </dialog>
  );
}
