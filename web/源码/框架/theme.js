(function(){
  try{
    var s = localStorage.getItem('zk-theme');
    if(!s){
      s = (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches)
          ? 'light' : 'dark';
    }
    document.documentElement.setAttribute('data-theme', s === 'light' ? 'light' : 'dark');
  }catch(e){
    document.documentElement.setAttribute('data-theme','dark');
  }
})();
