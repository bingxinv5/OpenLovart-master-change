import React from 'react';

interface VideoGeneratorFileInputsProps {
    imageInputRef: React.RefObject<HTMLInputElement | null>;
    videoInputRef: React.RefObject<HTMLInputElement | null>;
    audioInputRef: React.RefObject<HTMLInputElement | null>;
    onImageChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onVideoChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onAudioChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

export function VideoGeneratorFileInputs({
    imageInputRef,
    videoInputRef,
    audioInputRef,
    onImageChange,
    onVideoChange,
    onAudioChange,
}: VideoGeneratorFileInputsProps) {
    return (
        <>
            <input
                type="file"
                ref={imageInputRef}
                className="hidden"
                accept="image/*"
                multiple
                aria-label="上传参考图片"
                onChange={onImageChange}
            />
            <input
                type="file"
                ref={videoInputRef}
                className="hidden"
                accept="video/*"
                multiple
                aria-label="上传参考视频"
                onChange={onVideoChange}
            />
            <input
                type="file"
                ref={audioInputRef}
                className="hidden"
                accept="audio/*"
                multiple
                aria-label="上传参考音频"
                onChange={onAudioChange}
            />
        </>
    );
}