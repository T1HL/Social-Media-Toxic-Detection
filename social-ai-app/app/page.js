'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient'; 
import { MessageSquare, ThumbsUp, Share2, MoreHorizontal, Send, X, AlertTriangle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale'; // (Tuỳ chọn) Để hiển thị tiếng Việt thời gian

export default function Home() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('posts')
      .select('*, comments(*)')
      .order('created_at', { ascending: false });
    
    if (error) console.error('Error:', error);
    else setPosts(data || []);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#f0f2f5] py-5">
      <div className="max-w-xl mx-auto space-y-4">
        <div className="bg-white p-4 rounded-lg shadow mb-4 font-bold text-xl text-blue-600 sticky top-0 z-10 border-b border-gray-200">
          Phakebook AI
        </div>

        {loading && <p className="text-center text-gray-500">Đang tải...</p>}

        {posts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
    </div>
  );
}

// --- COMPONENT POST CARD ---
function PostCard({ post }) {
  const [commentInput, setCommentInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // State quản lý danh sách comment (để hiển thị ngay lập tức)
  const [localComments, setLocalComments] = useState(post.comments || []);

  // State quản lý Hộp thoại chặn (Block Modal)
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [blockedContent, setBlockedContent] = useState({ text: '', confidence: 0 });

  const handlePostComment = async (e) => {
    e.preventDefault();
    if (!commentInput.trim()) return;

    setIsSubmitting(true);
    const textToCheck = commentInput; // Lưu lại text để xử lý

    try {
        // BƯỚC 1: GỌI AI KIỂM TRA
        let isToxic = false;
        let confidence = 0;

        try {
            const aiResponse = await fetch('http://127.0.0.1:8000/predict', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: textToCheck })
            });

            if (aiResponse.ok) {
                const aiResult = await aiResponse.json();
                if (aiResult.is_toxic) {
                    isToxic = true;
                    confidence = aiResult.confidence;
                }
            }
        } catch (err) {
            console.warn("⚠️ AI Server không phản hồi, tạm thời cho qua.");
        }

        // --- TRƯỜNG HỢP 1: BỊ CHẶN ---
        if (isToxic) {
            // Hiển thị hộp thoại cảnh báo
            setBlockedContent({ text: textToCheck, confidence: confidence });
            setShowBlockModal(true);
            setIsSubmitting(false);
            return; // Dừng lại tại đây
        }

        // --- TRƯỜNG HỢP 2: THÀNH CÔNG (HIỂN THỊ NGAY) ---
        
        // Tạo comment giả lập để hiện lên màn hình ngay (Optimistic UI)
        const newFakeComment = {
            id: Math.random(), // ID tạm
            content: textToCheck,
            author_name: 'Bạn', // Hoặc lấy tên từ user login
            created_at: new Date().toISOString()
        };
        
        // Cập nhật state danh sách comment ngay lập tức
        setLocalComments((prev) => [...prev, newFakeComment]);
        setCommentInput(''); // Xóa ô nhập liệu ngay cho mượt

        // Sau đó mới gửi ngầm lên Supabase
        const { error } = await supabase
            .from('comments')
            .insert([{
                post_id: post.id,
                content: textToCheck,
                author_name: 'Bạn'
            }]);

        if (error) {
            // Nếu lỗi thì hoàn tác (xóa comment vừa hiện) - Tuỳ chọn
            console.error("Lỗi lưu Supabase:", error);
            alert("Lỗi mạng! Không lưu được bình luận.");
        }

    } catch (error) {
        console.error('Lỗi hệ thống:', error);
    } finally {
        setIsSubmitting(false);
    }
  };

  return (
    <>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden mb-4 relative">
            {/* Header Post */}
            <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center font-bold text-gray-600">
                    {post.author_name ? post.author_name[0] : 'U'}
                </div>
                <div>
                    <h3 className="font-semibold text-gray-900">{post.author_name || 'Unknown'}</h3>
                    <p className="text-xs text-gray-500">
                        {post.created_at ? formatDistanceToNow(new Date(post.created_at)) : ''} trước
                    </p>
                </div>
                </div>
                <MoreHorizontal className="text-gray-500 cursor-pointer" />
            </div>

            {/* Nội dung Post */}
            <div className="px-4 pb-4 text-gray-800 text-lg">
                {post.content}
            </div>

            {/* Actions */}
            <div className="px-4 py-2 border-t border-gray-100 flex items-center justify-between text-gray-500 text-sm">
                <button className="flex items-center gap-2 hover:bg-gray-100 px-4 py-2 rounded-md flex-1 justify-center transition"><ThumbsUp size={18}/> Thích</button>
                <button className="flex items-center gap-2 hover:bg-gray-100 px-4 py-2 rounded-md flex-1 justify-center transition"><MessageSquare size={18}/> Bình luận</button>
                <button className="flex items-center gap-2 hover:bg-gray-100 px-4 py-2 rounded-md flex-1 justify-center transition"><Share2 size={18}/> Chia sẻ</button>
            </div>

            {/* Khu vực Bình luận */}
            <div className="bg-gray-50 p-4 border-t border-gray-100">
                {/* Danh sách Comments */}
                <div className="space-y-3 mb-4 max-h-60 overflow-y-auto">
                    {localComments.map((cmt) => (
                        <div key={cmt.id} className="flex gap-2 animate-fadeIn">
                            <div className="w-8 h-8 rounded-full bg-blue-100 flex-shrink-0 flex items-center justify-center text-xs font-bold text-blue-600">
                                {cmt.author_name ? cmt.author_name[0] : 'U'}
                            </div>
                            <div className="bg-gray-200 rounded-2xl px-3 py-2 text-sm text-gray-900">
                                <span className="font-bold block text-xs text-gray-600">{cmt.author_name}</span>
                                <span>{cmt.content}</span>
                            </div>
                        </div>
                    ))}
                    {localComments.length === 0 && <p className="text-center text-xs text-gray-400">Chưa có bình luận nào.</p>}
                </div>

                {/* Form nhập liệu */}
                <form onSubmit={handlePostComment} className="flex items-center gap-2 relative">
                    <input 
                        type="text" 
                        className="flex-1 bg-gray-100 rounded-full px-4 py-2 outline-none border border-transparent focus:border-blue-500 transition text-black"
                        placeholder="Viết bình luận..."
                        value={commentInput}
                        onChange={(e) => setCommentInput(e.target.value)}
                        disabled={isSubmitting} 
                    />
                    <button type="submit" disabled={isSubmitting || !commentInput.trim()} className="p-2 text-blue-600 hover:bg-blue-100 rounded-full disabled:opacity-50">
                        <Send size={20} />
                    </button>
                </form>
            </div>
        </div>

        {/* --- MODAL HỘP THOẠI CHẶN BÌNH LUẬN --- */}
        {showBlockModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 relative animate-in zoom-in-95 duration-200 border-l-4 border-red-500">
                    
                    {/* Nút đóng */}
                    <button 
                        onClick={() => setShowBlockModal(false)}
                        className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
                    >
                        <X size={20} />
                    </button>

                    {/* Icon và Tiêu đề */}
                    <div className="flex items-center gap-3 mb-4 text-red-600">
                        <div className="bg-red-100 p-2 rounded-full">
                            <AlertTriangle size={24} />
                        </div>
                        <h3 className="text-lg font-bold">Bình luận bị chặn!</h3>
                    </div>

                    {/* Nội dung thông báo */}
                    <p className="text-gray-600 mb-4">
                        Hệ thống AI đã phát hiện nội dung của bạn vi phạm tiêu chuẩn cộng đồng (Ngôn từ đả kích/tiêu cực).
                    </p>

                    {/* Hiển thị nội dung bị chặn */}
                    <div className="bg-gray-100 p-3 rounded-lg mb-4 border border-gray-200">
                        <p className="text-xs text-gray-500 font-semibold mb-1">Nội dung vi phạm:</p>
                        <p className="text-gray-800 italic text-sm break-words">"{blockedContent.text}"</p>
                    </div>

                    {/* Độ tin cậy AI */}
                    <div className="flex justify-between items-center text-xs text-gray-500 border-t pt-3">
                        <span>Model: PhoBERT-Toxic</span>
                        <span>Độ tin cậy: <span className="font-bold text-red-500">{(blockedContent.confidence * 100).toFixed(1)}%</span></span>
                    </div>

                    <div className="mt-5 text-right">
                        <button 
                            onClick={() => setShowBlockModal(false)}
                            className="bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition text-sm font-medium"
                        >
                            Đã hiểu
                        </button>
                    </div>
                </div>
            </div>
        )}
    </>
  );
}