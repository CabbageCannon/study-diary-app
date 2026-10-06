import { Image } from "@tarojs/components";
import icons from "../assets/icons";

export type IconName = keyof typeof icons;
export function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  return <Image className={`ui-icon ${className}`} src={icons[name]} mode="aspectFit" />;
}
