import logo from "../components/logo.jpg";

export default function Logo({ size = "md" }: { size?: "sm" | "md" }) {
  const dims = size === "sm" ? "w-2 h-2 text-xs" : "w-2 h-2 text-sm";
  return <img src={logo} style={{ borderRadius: "50%", width: "25px" }}></img>;
}
