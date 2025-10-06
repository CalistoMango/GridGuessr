import React from "react";
import { X } from "lucide-react";

// Generic bottom-sheet modal used by prediction pickers. Keeps styling and
// accessibility behaviour (backdrop click closes, X button) in one place.

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ title, onClose, children }) => {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-3 pb-4 pt-20 sm:items-center sm:p-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl border border-gray-700 bg-gray-900 shadow-2xl sm:max-w-2xl sm:rounded-2xl"
        // Stop bubbling so clicks inside the modal body do not close the sheet.
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <button onClick={onClose} className="text-gray-400 transition-colors hover:text-white">
            <X className="h-6 w-6" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-4 pb-6 pt-2 touch-pan-y">{children}</div>
      </div>
    </div>
  );
};

export default Modal;
