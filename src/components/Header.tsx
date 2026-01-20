import React from "react";

interface HeaderProps {
  title: string;
}

const Header: React.FC<HeaderProps> = ({ title }) => {
  return (
    <header className="w-full py-2 px-4 bg-black/20 glass text-white flex items-center justify-between border-b border-white/10 fixed top-0 z-50">
      <h1 className="text-xl font-bold tracking-tight">{title}</h1>
    </header>
  );
};

export default Header;
