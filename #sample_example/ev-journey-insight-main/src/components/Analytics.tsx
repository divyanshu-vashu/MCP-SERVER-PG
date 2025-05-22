import { useState, useEffect } from 'react';
import { FixedSizeList } from 'react-window';
import { Navbar } from '@/components/Navbar';
import { 
  table_columns, 
  county_columns, 
  make_columns, 
  electric_vehicle_type_columns 
} from '@/lib/data';

interface FilterOption {
  column: string;
  values: string[];
  selectedValues: string[];
}

export function Analytics() {
  // State for selected columns
  const [selectedColumns, setSelectedColumns] = useState<string[]>(['make', 'model']);
  
  // State for filter options
  const [filters, setFilters] = useState<FilterOption[]>([
    { column: 'county', values: county_columns, selectedValues: [] },
    { column: 'make', values: make_columns, selectedValues: [] },
    { column: 'electric_vehicle_type', values: electric_vehicle_type_columns, selectedValues: [] },
  ]);
  
  // State for query results
  const [results, setResults] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // State for visible rows (for infinite scrolling)
  const [visibleRows, setVisibleRows] = useState(50);
  
  // Toggle column selection
  const toggleColumn = (column: string) => {
    setSelectedColumns(prev => 
      prev.includes(column) 
        ? prev.filter(col => col !== column) 
        : [...prev, column]
    );
  };
  
  // Toggle filter value selection
  const toggleFilterValue = (columnName: string, value: string) => {
    setFilters(prev => 
      prev.map(filter => 
        filter.column === columnName 
          ? {
              ...filter,
              selectedValues: filter.selectedValues.includes(value)
                ? filter.selectedValues.filter(v => v !== value)
                : [...filter.selectedValues, value]
            }
          : filter
      )
    );
  };
  
  // Build SQL query based on selections
  const buildQuery = () => {
    // If no columns selected, default to all columns
    const columns = selectedColumns.length > 0 ? selectedColumns : ['*'];
    
    let query = `SELECT ${columns.join(', ')} FROM vehicles`;
    
    // Add WHERE clauses for filters
    const whereClauses = filters
      .filter(filter => filter.selectedValues.length > 0)
      .map(filter => {
        const values = filter.selectedValues.map(v => `'${v}'`).join(', ');
        return `${filter.column} IN (${values})`;
      });
    
    if (whereClauses.length > 0) {
      query += ` WHERE ${whereClauses.join(' AND ')}`;
    }
    
    // // Add limit
    // query += ` LIMIT 1000`;
    
    return query;
  };
  
  // Execute query
  const executeQuery = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const query = buildQuery();
      console.log('Executing query:', query);
      
      const response = await fetch('http://localhost:3069/api/runner', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Failed to execute query');
      }
      
      setResults(data.data || []);
      setVisibleRows(50); // Reset visible rows on new query
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Query error:', err);
    } finally {
      setLoading(false);
    }
  };
  
  // Load more rows for infinite scrolling
  const loadMoreRows = () => {
    setVisibleRows(prev => Math.min(prev + 50, results.length));
  };
  
  // Handle scroll event for automatic loading
  const handleScroll = ({ scrollOffset }: { scrollOffset: number, scrollUpdateWasRequested: boolean }) => {
    const rowHeight = 35;
    const listHeight = Math.min(visibleRows * rowHeight, 500);
    const totalHeight = results.length * rowHeight;
    
    // Load more when near bottom (200px threshold)
    if (totalHeight - (scrollOffset + listHeight) < 200 && visibleRows < results.length) {
      loadMoreRows();
    }
  };
  
  // Execute query on mount and when selections change
  useEffect(() => {
    executeQuery();
  }, []); // Only on mount
  
  // Row renderer for virtualized list
  const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => {
    if (!results[index]) return null;
    
    return (
      <div style={{ ...style, display: 'flex', borderBottom: '1px solid #e5e7eb' }}>
        {Object.entries(results[index]).map(([key, value]) => (
          <div 
            key={key}
            className="px-4 py-2 text-sm"
            style={{ 
              flex: 1,
              minWidth: '120px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {String(value)}
          </div>
        ))}
      </div>
    );
  };
  
  return (
    <div className="min-h-screen">
      <Navbar />
      
      <div className="container mx-auto px-4 pt-20">
        <h1 className="text-2xl font-bold mb-6">EV Data Analytics</h1>
        
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar for filters */}
          <div className="w-full lg:w-1/4 bg-white p-4 rounded-lg shadow">
            <h2 className="font-semibold text-lg mb-4">Filters</h2>
            
            {filters.map(filter => (
              <div key={filter.column} className="mb-6">
                <h3 className="font-medium mb-2 capitalize">{filter.column.replace('_', ' ')}</h3>
                <div className="max-h-40 overflow-y-auto">
                  {filter.values.map(value => (
                    <div key={value} className="flex items-center mb-1">
                      <input
                        type="checkbox"
                        id={`${filter.column}-${value}`}
                        checked={filter.selectedValues.includes(value)}
                        onChange={() => toggleFilterValue(filter.column, value)}
                        className="mr-2"
                      />
                      <label htmlFor={`${filter.column}-${value}`} className="text-sm">
                        {value}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            
            <button
              onClick={executeQuery}
              disabled={loading}
              className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300 mt-4"
            >
              {loading ? 'Loading...' : 'Apply Filters'}
            </button>
          </div>
          
          {/* Main content */}
          <div className="w-full lg:w-3/4">
            {/* Column selector */}
            <div className="bg-white p-4 rounded-lg shadow mb-6">
              <h2 className="font-semibold text-lg mb-3">Select Columns</h2>
              <div className="flex flex-wrap gap-2">
                {table_columns.map(column => (
                  <button
                    key={column}
                    onClick={() => toggleColumn(column)}
                    className={`px-3 py-1 text-sm rounded-md transition-colors ${
                      selectedColumns.includes(column)
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 hover:bg-gray-200 text-gray-800'
                    }`}
                  >
                    {column}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Results table */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
              {error && (
                <div className="p-4 bg-red-50 text-red-700 border-b">
                  Error: {error}
                </div>
              )}
              
              {results.length > 0 ? (
                <div>
                  {/* Table header */}
                  <div className="bg-gray-50 border-b flex">
                    {Object.keys(results[0]).map(header => (
                      <div 
                        key={header}
                        className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                        style={{ 
                          flex: 1,
                          minWidth: '120px'
                        }}
                      >
                        {header}
                      </div>
                    ))}
                  </div>
                  
                  {/* Virtualized rows */}
                  <FixedSizeList
                    height={Math.min(visibleRows * 35, 500)}
                    itemCount={Math.min(visibleRows, results.length)}
                    itemSize={35}
                    width="100%"
                    onScroll={handleScroll}
                  >
                    {Row}
                  </FixedSizeList>
                  
                  {/* Load more button */}
                  {visibleRows < results.length && (
                    <div className="p-4 border-t">
                      <button
                        onClick={loadMoreRows}
                        className="w-full py-2 bg-gray-100 hover:bg-gray-200 text-sm font-medium rounded-lg"
                      >
                        Show More ({results.length - visibleRows} remaining rows)
                      </button>
                    </div>
                  )}
                </div>
              ) : !loading ? (
                <div className="p-8 text-center text-gray-500">
                  No results found. Try adjusting your filters.
                </div>
              ) : (
                <div className="p-8 text-center text-gray-500">
                  Loading data...
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Analytics;
