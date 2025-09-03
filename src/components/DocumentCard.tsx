interface Document {
  file_id: string;
  filename: string;
  size: number;
  content_type: string;
  tags: string[];
  status: 'uploaded' | 'processing' | 'processed' | 'error';
}

interface DocumentCardProps {
  document: Document;
  onDelete: () => void;
}

export default function DocumentCard({ document, onDelete }: DocumentCardProps) {
  const getStatusColor = (status: Document['status']) => {
    switch (status) {
      case 'uploaded':
        return 'bg-yellow-100 text-yellow-800';
      case 'processing':
        return 'bg-blue-100 text-blue-800';
      case 'processed':
        return 'bg-green-100 text-green-800';
      case 'error':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-semibold truncate">{document.filename}</h3>
        <button onClick={onDelete} className="text-gray-500 hover:text-red-500">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
      <p className="text-xs text-gray-500 mb-2">
        {(document.size / 1024 / 1024).toFixed(2)} MB • {document.content_type}
      </p>
      <p className={`text-xs font-medium px-2 py-1 rounded-full inline-block ${getStatusColor(document.status)}`}>
        {document.status.charAt(0).toUpperCase() + document.status.slice(1)}
      </p>
      <div className="flex flex-wrap gap-2 mt-2">
        {document.tags.map((tag, index) => (
          <span
            key={index}
            className="tag bg-blue-100 text-blue-800"
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}