import React from 'react';

export const Card = ({ children, className = "", onClick }) => (
  <div
    onClick={onClick}
    role={onClick ? 'button' : undefined}
    tabIndex={onClick ? 0 : undefined}
    onKeyDown={onClick ? event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onClick(event);
      }
    } : undefined}
    className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-5 ${
      onClick ? 'cursor-pointer active:scale-[0.99] transition-all hover:shadow-md outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2' : ''
    } ${className}`}
  >
    {children}
  </div>
);
