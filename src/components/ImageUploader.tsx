// src/components/ImageUploader.tsx
import React, { useRef } from "react";
import { ImageFile } from "../types";

interface ImageUploaderProps {
  label: string;
  onUpload: (files: ImageFile[]) => void;
  multiple?: boolean;
  accept?: string;
}

const ImageUploader: React.FC<ImageUploaderProps> = ({
  label,
  onUpload,
  multiple = false,
  accept = "image/*",
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newFiles: ImageFile[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();

      const promise = new Promise<void>((resolve) => {
        reader.onload = () => {
          const base64 = (reader.result as string).split(",")[1];
          newFiles.push({
            id: Math.random().toString(36).substr(2, 9),
            name: file.name,
            url: URL.createObjectURL(file),
            file: file,
            base64,
            mimeType: file.type,
          });
          resolve();
        };
      });

      reader.readAsDataURL(file);
      await promise;
    }

    onUpload(newFiles);

    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="w-full">
      <input
        type="file"
        ref={inputRef}
        onChange={handleFileChange}
        className="hidden"
        multiple={multiple}
        accept={accept}
      />
      <button
        onClick={() => inputRef.current?.click()}
        className="w-full py-4 border-2 border-dashed border-white/10 rounded-xl bg-white/5 hover:bg-white/10 hover:border-white/20 transition-all group"
      >
        <div className="flex flex-col items-center gap-2">
          <i className="fas fa-cloud-upload-alt text-gray-500 group-hover:text-white transition-colors text-xl"></i>
          <span className="text-sm font-medium text-gray-400 group-hover:text-white">
            {label}
          </span>
        </div>
      </button>
    </div>
  );
};

export default ImageUploader;
