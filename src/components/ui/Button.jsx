import React from 'react';

export const Button = ({
  children,
  onClick,
  variant = "primary",
  className = "",
  disabled = false,
  type = "button"
}) => {
  const variants = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-500/20 active:scale-[0.98]",
    secondary: "bg-gray-100 text-gray-700 hover:bg-gray-200 active:scale-[0.98]",
    danger: "bg-rose-50 text-rose-600 hover:bg-rose-100 active:scale-[0.98]",
    success: "bg-emerald-600 text-white hover:bg-emerald-700 shadow-md shadow-emerald-500/20 active:scale-[0.98]",
    warning: "bg-amber-500 text-white hover:bg-amber-600 shadow-md shadow-amber-500/20 active:scale-[0.98]",
    purple: "bg-purple-600 text-white hover:bg-purple-700 shadow-md shadow-purple-500/20 active:scale-[0.98]",
    ghost: "bg-transparent text-gray-500 hover:text-blue-600 hover:bg-blue-50"
  };

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`px-4 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed outline-none cursor-pointer ${variants[variant] || variants.primary} ${className}`}
    >
      {children}
    </button>
  );
};
