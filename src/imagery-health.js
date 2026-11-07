// Ignore isolated tile failures; notify only after several failures in a short window.
export function createImageryHealth(onUnavailable,{now=Date.now,threshold=3,windowMs=15000}={}){
  let failures=[];
  return {
    success(){failures=[]},
    reset(){failures=[]},
    failure(){const time=now();failures=failures.filter(value=>time-value<windowMs);failures.push(time);if(failures.length>=threshold){failures=[];onUnavailable()}}
  };
}
