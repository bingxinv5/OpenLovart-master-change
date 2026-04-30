import { useCallback, useState } from 'react';
import {
    deleteStoryboardMetaTemplate,
    listStoryboardMetaTemplates,
    saveStoryboardMetaTemplate,
    type StoryboardMetaTemplateEntry,
    type StoryboardMetaTemplateValue,
} from '@/lib/storyboard-meta-presets';

interface UseStoryboardTemplatesOptions {
    getTemplateValue: () => StoryboardMetaTemplateValue;
    onLoadTemplate: (template: StoryboardMetaTemplateEntry) => void;
}

export function useStoryboardTemplates({ getTemplateValue, onLoadTemplate }: UseStoryboardTemplatesOptions) {
    const [storyboardTemplateName, setStoryboardTemplateName] = useState('');
    const [storyboardTemplateHint, setStoryboardTemplateHint] = useState('');
    const [storyboardTemplates, setStoryboardTemplates] = useState<StoryboardMetaTemplateEntry[]>(() => listStoryboardMetaTemplates());

    const saveCurrentStoryboardTemplate = useCallback(() => {
        const next = saveStoryboardMetaTemplate(storyboardTemplateName || '分镜模板', getTemplateValue());
        setStoryboardTemplates(next);
        setStoryboardTemplateHint('已保存分镜模板');
        setStoryboardTemplateName('');
    }, [getTemplateValue, storyboardTemplateName]);

    const loadStoryboardTemplate = useCallback((template: StoryboardMetaTemplateEntry) => {
        onLoadTemplate(template);
        setStoryboardTemplateHint(`已载入模板：${template.name}`);
    }, [onLoadTemplate]);

    const deleteStoryboardTemplate = useCallback((template: StoryboardMetaTemplateEntry) => {
        const next = deleteStoryboardMetaTemplate(template.id);
        setStoryboardTemplates(next);
        setStoryboardTemplateHint(`已删除模板：${template.name}`);
    }, []);

    const resetStoryboardTemplateForm = useCallback(() => {
        setStoryboardTemplateName('');
        setStoryboardTemplateHint('');
    }, []);

    return {
        storyboardTemplates,
        storyboardTemplateName,
        setStoryboardTemplateName,
        storyboardTemplateHint,
        saveCurrentStoryboardTemplate,
        loadStoryboardTemplate,
        deleteStoryboardTemplate,
        resetStoryboardTemplateForm,
    };
}