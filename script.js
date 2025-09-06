document.addEventListener('DOMContentLoaded', () => {
    const imageInput = document.getElementById('image-input');
    const imagePreview = document.getElementById('image-preview');
    const imagePreviewContainer = document.getElementById('image-preview-container');
    const sendBtn = document.getElementById('send-btn');
    const promptInput = document.getElementById('prompt-input');
    const responseOutput = document.getElementById('response-output');
    const loadingSpinner = document.getElementById('loading-spinner');
    const responseContainerWrapper = document.getElementById('response-container-wrapper');
    const leftPanel = document.getElementById('left-panel');
    const flexContainer = document.querySelector('.flex-container');

    let imageData = null;
    let imageMimeType = null;

    const API_KEY = "AIzaSyB0yrvRUgR8Mo_l36gdUlaa_LMj3ELeUEs";
    const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${API_KEY}`;
    const SYSTEM_PROMPT = "你是一个世界级的摄影导师。请分析这张照片的构图、光线、主题和技术执行，并提供专业的改进建议。你的回答需要使用Markdown格式，包括标题、加粗文本和列表，以确保结果清晰、易于阅读。请使用中文回答。";

    const setResponseContainerHeight = () => {
        const isDesktop = window.innerWidth >= 768;
        if (!isDesktop) {
            responseContainerWrapper.style.position = 'static';
            responseContainerWrapper.style.height = 'auto';
            return;
        }

        responseContainerWrapper.style.position = 'absolute';
        const leftPanelHeight = leftPanel.offsetHeight;
        responseContainerWrapper.style.height = `${leftPanelHeight}px`;

    };

    const observer = new MutationObserver(setResponseContainerHeight);
    observer.observe(leftPanel, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class']
    });

    imageInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                imagePreview.src = e.target.result;
                imagePreviewContainer.classList.remove('hidden');

                const dataUrl = e.target.result;
                const [mimePart, base64Part] = dataUrl.split(';base64,');
                imageMimeType = mimePart.replace('data:', '');
                imageData = base64Part;
                setResponseContainerHeight();
            };
            reader.readAsDataURL(file);
        } else {
            imagePreviewContainer.classList.add('hidden');
            imageData = null;
            imageMimeType = null;
            setResponseContainerHeight();
        }
    });

    window.addEventListener('resize', setResponseContainerHeight);

    async function fetchWithRetry(url, options, retries = 5, delay = 1000) {
        try {
            const response = await fetch(url, options);
            if (response.status === 503 || response.status === 429) {
                if (retries > 0) {
                    console.log(`API过载，等待 ${delay}ms 后重试... (剩余重试次数: ${retries})`);
                    await new Promise(res => setTimeout(res, delay));
                    return fetchWithRetry(url, options, retries - 1, delay * 2);
                } else {
                    throw new Error('API 过载，重试次数已用尽。请稍后再试。');
                }
            }
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`API 请求失败：${response.statusText}. 错误信息：${JSON.stringify(errorData)}`);
            }
            return response;
        } catch (error) {
            throw error;
        }
    }

    // Markdown 转换函数
    const markdownToHtml = (markdown) => {
        // 将 Markdown 标题转换为 HTML
        let html = markdown.replace(/^###\s(.+)$/gm, '<h3>$1</h3>');
        html = html.replace(/^##\s(.+)$/gm, '<h2>$1</h2>');
        html = html.replace(/^#\s(.+)$/gm, '<h1>$1</h1>');

        // 将加粗文本转换为 <strong>
        html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

        // 将列表转换为 <ul> 和 <li>
        html = html.replace(/^\*\s(.+)$/gm, '<li>$1</li>');
        if (html.includes('<li>')) {
            html = `<ul>${html}</ul>`;
        }

        // 将换行符转换为 <br>
        html = html.replace(/\n/g, '<br>');

        return html;
    };


    sendBtn.addEventListener('click', async () => {
        const prompt = promptInput.value.trim();
        if (!prompt && !imageData) {
            const modal = document.createElement('div');
            modal.innerHTML = `
                <div class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center">
                    <div class="relative mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
                        <h3 class="text-lg font-bold mb-4">提示</h3>
                        <div class="mt-2 px-7 py-3">
                            <p class="text-sm text-gray-500">请输入一个问题或上传一张图片。</p>
                        </div>
                        <div class="items-center px-4 py-3">
                            <button id="close-modal" class="px-4 py-2 bg-indigo-500 text-white text-base font-medium rounded-md w-full shadow-sm hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                                确定
                            </button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            document.getElementById('close-modal').onclick = () => {
                document.body.removeChild(modal);
            };
            return;
        }

        responseOutput.innerHTML = '';
        loadingSpinner.classList.remove('hidden');
        sendBtn.disabled = true;
        sendBtn.classList.add('opacity-50', 'cursor-not-allowed');

        try {
            const parts = [];
            if (prompt) {
                parts.push({
                    text: prompt
                });
            }
            if (imageData && imageMimeType) {
                parts.push({
                    inlineData: {
                        mimeType: imageMimeType,
                        data: imageData
                    }
                });
            }

            const payload = {
                contents: [{
                    parts: parts
                }],
                systemInstruction: {
                    parts: [{
                        text: SYSTEM_PROMPT
                    }]
                }
            };

            const response = await fetchWithRetry(API_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

            if (text) {
                // 将 Markdown 文本转换为 HTML 格式
                responseOutput.innerHTML = markdownToHtml(text);
            } else {
                responseOutput.innerHTML = '对不起，没有找到答案。';
            }

        } catch (error) {
            responseOutput.innerHTML = `<span class="text-red-500">发生错误：${error.message}</span><br><br>请检查您的网络连接。`;
            console.error('Fetch error:', error);
        } finally {
            loadingSpinner.classList.add('hidden');
            sendBtn.disabled = false;
            sendBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    });

    setResponseContainerHeight();
});
