// Combined examples library assembled from split matrix/strip sources.
(function(){
  const matrix = Array.isArray(window.EXAMPLE_LIBRARY_MATRIX) ? window.EXAMPLE_LIBRARY_MATRIX : [];
  const strip = Array.isArray(window.EXAMPLE_LIBRARY_STRIP) ? window.EXAMPLE_LIBRARY_STRIP : [];

  window.getExampleLibraryForType = function(type) {
    return type === 'strip' ? strip : matrix;
  };

  window.EXAMPLE_LIBRARY = [
    ['# Matrix Effects', ''],
    ...matrix,
    ['# Strip Effects', ''],
    ...strip
  ];
})();
