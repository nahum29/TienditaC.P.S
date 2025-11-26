interface TableProps {
  headers: string[];
  rows: (string | number)[][];
  actions?: {
    label: string;
    onClick: (index: number) => void;
    variant?: 'primary' | 'secondary' | 'danger';
  }[];
}

export function Table({ headers, rows, actions }: TableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-gray-100 border-b-2 border-gray-200">
            {headers.map((header, i) => (
              <th key={i} className="px-4 py-3 text-left font-semibold text-gray-700">
                {header}
              </th>
            ))}
            {actions && <th className="px-4 py-3 text-center font-semibold text-gray-700">Acciones</th>}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={headers.length + (actions ? 1 : 0)} className="px-4 py-8 text-center text-gray-500">
                No hay datos disponibles
              </td>
            </tr>
          ) : (
            rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b border-gray-200 hover:bg-gray-50">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="px-4 py-3 text-gray-700">
                    {cell}
                  </td>
                ))}
                {actions && (
                  <td className="px-4 py-3 text-center space-x-2">
                    {actions.map((action, i) => (
                      <button
                        key={i}
                        onClick={() => action.onClick(rowIndex)}
                        className={`px-3 py-1 rounded text-xs font-medium transition ${
                          action.variant === 'danger'
                            ? 'bg-red-100 text-red-600 hover:bg-red-200'
                            : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                        }`}
                      >
                        {action.label}
                      </button>
                    ))}
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
