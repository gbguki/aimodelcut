// src/components/ImageUploader.tsx
import React, { useRef, useState } from "react";
import { ImageFile } from "../types";

interface ImageUploaderProps {
  label: string;
  onUpload: (files: ImageFile[]) => void;
  multiple?: boolean;
  accept?: string;
  compact?: boolean;
}

const ImageUploader: React.FC<ImageUploaderProps> = ({
  label,
  onUpload,
  multiple = false,
  accept = "image/*",
  compact = false,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const processFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const imageFiles = fileArray.filter(file => file.type.startsWith('image/'));
    
    if (imageFiles.length === 0) return;

    const newFiles: ImageFile[] = [];

    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i];
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
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    await processFiles(files);

    if (inputRef.current) inputRef.current.value = "";
  };

  // 드래그 & 드랍 핸들러
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      // multiple이 false면 첫 번째 파일만 처리
      if (!multiple && files.length > 1) {
        const singleFile = [files[0]];
        await processFiles(singleFile as unknown as FileList);
      } else {
        await processFiles(files);
      }
    }
  };

  return (
    <div 
      className={compact ? "w-full aspect-square" : "w-full"}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
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
        className={`w-full border-2 border-dashed transition-all group ${
          isDragging 
            ? "border-blue-500 bg-blue-500/10" 
            : "border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20"
        } ${
          compact 
            ? "h-full rounded-lg flex items-center justify-center" 
            : "py-4 rounded-xl"
        }`}
      >
        {compact ? (
          <span className={`text-2xl transition-colors ${
            isDragging ? "text-blue-400" : "text-gray-500 group-hover:text-white"
          }`}>
            {isDragging ? "+" : label}
          </span>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <i className={`fas fa-cloud-upload-alt text-xl transition-colors ${
              isDragging ? "text-blue-400" : "text-gray-500 group-hover:text-white"
            }`}></i>
            <span className={`text-sm font-medium transition-colors ${
              isDragging ? "text-blue-400" : "text-gray-400 group-hover:text-white"
            }`}>
              {isDragging ? "여기에 놓으세요" : label}
            </span>
            <span className="text-[10px] text-gray-600">
              클릭 또는 드래그 & 드랍
            </span>
          </div>
        )}
      </button>
    </div>
  );
};

export default ImageUploader;
