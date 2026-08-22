import React from 'react';

export const Card = ({ children, className = "", onClick }) => (
  <div
    onClick={onClick}
    className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-5 ${
      onClick ? 'cursor-pointer active:scale-[0.99] transition-all hover:shadow-md' : ''
    } ${className}`}
  >
    {children}
  </div>
);
