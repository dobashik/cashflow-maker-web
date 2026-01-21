'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface DialogContextType {
    isOpen: boolean;
    open: () => void;
    close: () => void;
    onOpenChange: (open: boolean) => void;
}

const DialogContext = createContext<DialogContextType | undefined>(undefined);

interface DialogProps {
    children: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}

export const Dialog = ({ children, open: controlledOpen, onOpenChange: controlledOnOpenChange }: DialogProps) => {
    const [uncontrolledOpen, setUncontrolledOpen] = useState(false);

    const isControlled = controlledOpen !== undefined;
    const isOpen = isControlled ? controlledOpen : uncontrolledOpen;

    const handleOpenChange = (newOpen: boolean) => {
        if (controlledOnOpenChange) {
            controlledOnOpenChange(newOpen);
        }
        if (!isControlled) {
            setUncontrolledOpen(newOpen);
        }
    };

    const open = () => handleOpenChange(true);
    const close = () => handleOpenChange(false);

    return (
        <DialogContext.Provider value={{ isOpen, open, close, onOpenChange: handleOpenChange }}>
            {children}
        </DialogContext.Provider>
    );
};

export const DialogTrigger = ({ children, asChild }: { children: React.ReactNode, asChild?: boolean }) => {
    const context = useContext(DialogContext);
    if (!context) throw new Error("DialogTrigger must be used within Dialog");

    return (
        <div onClick={context.open} className="cursor-pointer inline-block">
            {children}
        </div>
    );
};

export const DialogContent = ({ children, className }: { children: React.ReactNode, className?: string }) => {
    const context = useContext(DialogContext);
    if (!context) throw new Error("DialogContent must be used within Dialog");

    return (
        <AnimatePresence>
            {context.isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
                        onClick={context.close}
                    />

                    {/* Modal */}
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            transition={{ duration: 0.2 }}
                            className={`pointer-events-auto relative w-full max-w-lg bg-white rounded-xl shadow-2xl p-6 border border-slate-100 ${className || ''}`}
                        >
                            <button
                                onClick={context.close}
                                className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
                            >
                                <X className="h-4 w-4" />
                                <span className="sr-only">Close</span>
                            </button>
                            {children}
                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>
    );
};

export const DialogHeader = ({ children, className }: { children: React.ReactNode, className?: string }) => (
    <div className={`flex flex-col space-y-1.5 text-center sm:text-left mb-4 ${className || ''}`}>
        {children}
    </div>
);

export const DialogTitle = ({ children, className }: { children: React.ReactNode, className?: string }) => (
    <h2 className={`text-lg font-semibold leading-none tracking-tight text-slate-900 ${className || ''}`}>
        {children}
    </h2>
);

export const DialogDescription = ({ children, className }: { children: React.ReactNode, className?: string }) => (
    <p className={`text-sm text-slate-500 ${className || ''}`}>
        {children}
    </p>
);
