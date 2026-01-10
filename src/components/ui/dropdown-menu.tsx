'use client';

import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/utils/cn'; // Assuming utils/cn exists, if not I'll use a simple join or create it.
// Check if cn exists? I see 'clsx' and 'tailwind-merge' in package.json so probably typical setup.
// If I'm unsure, I can inline the utility or check first.
// Let's assume standard shadcn-like structure was attempted, so utils/cn might be there.
// If not, I'll inline the merge function or check file structure again. 
// Wait, I saw components/ui but I didn't verify utils/cn.
// Let's just implement a simple class joiner to be safe, or check utils.

// Re-checking utils folder...
// I saw "utils" dir in file list earlier.

interface DropdownContextType {
    isOpen: boolean;
    toggle: () => void;
    close: () => void;
}

const DropdownContext = createContext<DropdownContextType | undefined>(undefined);

export const DropdownMenu = ({ children }: { children: React.ReactNode }) => {
    const [isOpen, setIsOpen] = useState(false);

    // Auto close on click outside
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggle = () => setIsOpen(!isOpen);
    const close = () => setIsOpen(false);

    return (
        <DropdownContext.Provider value={{ isOpen, toggle, close }}>
            <div className="relative inline-block text-left" ref={ref}>
                {children}
            </div>
        </DropdownContext.Provider>
    );
};

export const DropdownMenuTrigger = ({ children, asChild }: { children: React.ReactNode, asChild?: boolean }) => {
    const context = useContext(DropdownContext);
    if (!context) throw new Error("DropdownMenuTrigger must be used within DropdownMenu");

    return (
        <div onClick={context.toggle} className="cursor-pointer">
            {children}
        </div>
    );
};

export const DropdownMenuContent = ({
    children,
    align = 'end',
    className
}: {
    children: React.ReactNode,
    align?: 'start' | 'end' | 'center',
    className?: string
}) => {
    const context = useContext(DropdownContext);
    if (!context) throw new Error("DropdownMenuContent must be used within DropdownMenu");

    const alignClass = align === 'end' ? 'right-0' : align === 'start' ? 'left-0' : 'left-1/2 -translate-x-1/2';

    return (
        <AnimatePresence>
            {context.isOpen && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -5 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -5 }}
                    transition={{ duration: 0.1 }}
                    className={`absolute z-50 mt-2 min-w-[8rem] overflow-hidden rounded-md border bg-popover bg-white p-1 text-popover-foreground shadow-md ${alignClass} ${className || ''}`}
                >
                    {children}
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export const DropdownMenuItem = ({
    children,
    className,
    onClick
}: {
    children: React.ReactNode,
    className?: string,
    onClick?: () => void
}) => {
    const context = useContext(DropdownContext);

    const handleClick = () => {
        if (onClick) onClick();
        context?.close();
    };

    return (
        <div
            className={`relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-slate-100 hover:text-slate-900 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 ${className || ''}`}
            onClick={handleClick}
        >
            {children}
        </div>
    );
};
